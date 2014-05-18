// Copyright Joyent, Inc. All rights reserved.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

var assert = require('assert');
var exec = require('child_process').exec;
var Writable = require('stream').Writable;
var util = require('util');

var bunyan = require('bunyan');
var manta = require('manta');

function MantaJob(opts) {
  if (!(this instanceof MantaJob))
    return new MantaJob(opts);

  if (typeof opts === 'string')
    this.name = opts;
  else
    this.name = opts.name;

  Writable.call(this, {
    objectMode: true,
    decodeStrings: false,
  });

  this._phases = [];
  this._finalDestination = [];

  this._log = bunyan.createLogger({
    name: 'mlang',
    level: (process.env.LOG_LEVEL || 'info'),
    stream: process.stderr,
  });

  this._client = manta.createBinClient({
    log: this._log.child({ type: 'mantaclient' }),
  });

  this._job = undefined;
  this._jobId = undefined;
  this._incomingKeys = 0;
  this._addedKeys = 0;
  this._outstandingPackages = 0;
  this._ended = undefined;
  this._pendingKeys = [];
  this._packages = {};

  var self = this;

  this.on('pipe', function onPipe(src) {
    self._log.debug('objects are being piped into us', src);
    src.on('end', function onObjectsEnd() {
      self._log.debug('all inputs have been passed in');
      self._canEnd = true;
    });
  });
}
util.inherits(MantaJob, Writable);
exports.MantaJob = MantaJob;

MantaJob.prototype.pipe = function MantaJobPipe(dest) {
  this._finalDestination.push(dest);
  return this;
};

MantaJob.prototype.map = function MantaJobMap(phase) {
  this._phases.push({ type: 'map', value: phase })
  return this;
};

MantaJob.prototype.reduce = function MantaJobReduce(phase) {
  this._phases.push({ type: 'reduce', value: phase });
  return this;
};

MantaJob.prototype._createJob = function MantaJobCreate(cb) {
  assert.strictEqual(this._job, undefined, 'cannot recreate job');

  var self = this;

  var job = {
    name: this.name,
    phases: this._phases.map(function toPhase(phase) {
      self._log.debug('calling toJob', phase.value);
      return phase.value.toJob(phase.type);
    }),
  };

  if (this._finalDestination.length) {
    this._finalDestination.forEach(function(dest) {
      job.phases.push({
        type: 'reduce',
        exec: UnixWrapper('mpipe')(dest).toCommand(),
      });
    });
  }

  this._log.debug('created job', job);

  this._client.createJob(job, cb);
  
  this._job = setInterval(function() {
    self._checkState();
  }, 1000);
};

MantaJob.prototype._checkState = function checkState() {
  var self = this;

  this._client.job(this._jobId, function onJob(err, job) {
    if (job.state === 'done') {
      clearInterval(self._job);
      self._client.close();
      self.emit('end', job);
    }
  });
};

MantaJob.prototype._shouldEnd = function shouldEnd() {
  var self = this;

  self._log.debug('shouldEnd', self._incomingKeys, self._addedKeys);

  assert.strictEqual(self._ended, undefined, 'cannot re-end input');

  if (self._incomingKeys === self._addedKeys) {
    self._ended = Date.now();
    self._client.endJob(self._jobId, function endedJob(err) {
      if (err) {
        self._log.error('failed to end input', chunk, err);
      } else {
        self._log.debug('ended job input');
      }
    });
  }
};

MantaJob.prototype._write = function _write(chunk, encoding, cb) {
  var self = this;

  self._log.debug('adding key', chunk);
  self._incomingKeys++;

  if (!this._job) {
    self._pendingKeys.push({ value: chunk, cb: cb });
    self._checkCreate();
  } else {
    self._client.addJobKey(this._jobId, chunk, function (err, job) {
      self._addedKey(err, { value: chunk, cb: cb });
    });
  }
};

var MantaStep = require('./step');
var tempfile = require('tempfile');

MantaJob.prototype.addPackage = function addPackage(path) {
  var info = require(process.cwd() + '/' + path + '/package.json');

  var name = info.name;
  var version = info.version;

  var p = this._packages[path + name + version];

  if (p)
    return p.func;

  var t = tempfile('.tar.gz');

  p = this._packages[name + path] = {
    path: path,
    asset: '/' + this._client.user + '/stor/tmp' + t,
    init: 'npm install /assets/' + this._client.user + '/stor/tmp' + t,
  };

  this._outstandingPackages++;

  var cmd = 'PACKAGE=$(npm pack ' + path + ') && mmkdir -p $(dirname '+ p.asset +') && mput -qf $PACKAGE ' + p.asset + ' && rm $PACKAGE';

  var self = this;

  exec(cmd, function(err, stdout, stderr) {
    if (err) {
      console.error(cmd);
      console.error(stderr.toString());
      console.log(stdout);
      throw err;
    }

    self._outstandingPackages--;
    self._checkCreate();
  });

  function bundle(opts) {
    if (!(this instanceof bundle))
      return new bundle(opts);

    MantaStep.call(this);

    this.opts = JSON.stringify(opts);

    this.cmd = '(echo "require(\\"' + name + '\\")" > ' + name + '.t.js; node ./' + name + '.t.js ' + util.inspect(this.opts) + ')';

    this.asset = p.asset;
    this.init = p.init;
  }
  util.inherits(bundle, MantaStep);

  p.func = bundle;

  return bundle;
};

MantaJob.prototype._addedKey = function addedKey(err, key) {
  var self = this;

  self._addedKeys++;
  if (err)
    self._log.error('failed to add key', key, err);
  else
    self._log.debug('key added', key);

  if (self._canEnd && self._incomingKeys === self._addedKeys) {
    setImmediate(function() {
      self._shouldEnd();
    });
  }

  key.cb(err);
};

MantaJob.prototype._flushKeys = function flushKeys() {
  var self = this;

  while (this._pendingKeys.length) {
    var key = this._pendingKeys.pop();
    this._client.addJobKey(this._jobId, key.value, function (err, job) {
      self._addedKey(err, key);
    });
  }
};

MantaJob.prototype._checkCreate = function checkCreate() {
  if (this._outstandingPackages !== 0)
    return;

  var self = this;

  this._createJob(function createdJob(err, jobid) {
    if (err) {
      clearInterval(self._job);
      self._log.error(err);
    } else {
      self._log.debug('job created', jobid);
      self._jobId = jobid;
      self._flushKeys();
    }
  });
};

function UnixWrapper(exe) {
  function cli(args) {
    if (!(this instanceof cli))
      return new cli(args);

    MantaStep.call(this);

    this.cmd = [exe].concat(args).join(' ');
  };
  util.inherits(cli, MantaStep);
  return cli;
}
exports.UnixWrapper = UnixWrapper;
