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

function MantaStep() {
  if (!(this instanceof MantaStep))
    return new MantaStep();

  this._next = undefined;
  this._prev = undefined;
}

MantaStep.prototype.pipe = function pipe(dest) {
  assert.strictEqual(this._next, undefined);

  this._next = dest;
  dest._prev = this;

  return dest;
};

MantaStep.prototype.toJob = function toJob(type) {
  var cur = this;

  // rewind to start of list
  while (cur._prev !== undefined)
    cur = cur._prev;

  var assets = [];
  var inits = [];
  var phase = [];

  do {
    phase.push(cur.toCommand());

    if (cur.asset)
      assets.push(cur.asset);

    if (cur.init)
      inits.push(cur.init);

    cur = cur._next;
  } while (cur !== undefined);

  return {
    type: type,
    exec: phase.join(' | '),
    assets: assets,
    image: '13.3',
    init: inits.join(' && '),
  };
};

MantaStep.prototype.toCommand = function MantaStepCommand() {
  if (!this.cmd)
    throw new Error('you must resolve into a command');

  return this.cmd;
};

module.exports = MantaStep;
