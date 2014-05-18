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

var Readable = require('stream').Readable;
var util = require('util');

var bunyan = require('bunyan');
var manta = require('manta');

function mfind(path, opts) {
  if (!(this instanceof mfind))
    return new mfind(path, opts);

  Readable.call(this, {
    objectMode: true,
    decodeStrings: false,
  });

  this._log = bunyan.createLogger({
    name: 'mfind',
    level: (process.env.LOG_LEVEL || 'info'),
    stream: process.stderr,
  });

  this._client = manta.createBinClient({
    log: this._log.child({ type: 'mantaclient' }),
  });

  var self = this;

  this._client.ftw(path, opts || {}, function (err, res) {
    if (err) {
      self._log.error(err);
      self.emit(error, err);
    } else {
      self._log.debug('client ftw running', path, opts);
      res.on('entry', function onEntry(entry) {
        var p = entry.parent + (entry.name ? ('/' + entry.name) : '');
        self._log.debug('entry', entry, p);
        self.push(p);
      });
      res.on('end', function onEnd() {
        self.push(null);
        self._client.close();
      });
    }
  });
}
util.inherits(mfind, Readable);

mfind.prototype._read = function() {
};

exports.mfind = mfind;
