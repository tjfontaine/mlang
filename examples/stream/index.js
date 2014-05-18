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

var Transform = require('stream').Transform;
var util = require('util');

var lstream = require('lstream');

function ExampleStream(opts) {
  if (!(this instanceof ExampleStream))
    return new ExampleStream(opts);

  Transform.call(this, {
    objectMode: true,
    decodeStrings: false,
  });

  this.opts = typeof opts === 'object' ? opts : { value: opts };

  this.regex = new RegExp(this.opts.value, this.opts.flags || 'i');
}
util.inherits(ExampleStream, Transform);

ExampleStream.prototype._transform = function(chunk, enc, done) {
  if (this.regex.test(chunk))
    this.push(chunk + '\n');
  done();
};

if (process.env.MANTA_INPUT_FILE) {
  process.stdin
    .pipe(new lstream())
    .pipe(ExampleStream(JSON.parse(process.argv[2])))
    .pipe(process.stdout);
}
