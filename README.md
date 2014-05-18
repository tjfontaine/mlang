## mlang

Use Node.js streams to write [Joyent Manta](http://joyent.com/products/manta) jobs

## License

MIT

## Example

```javascript
var mlang = require('mlang');
mlang.pollute();

mfind('/manta/public/examples/shakespeare/')
  .pipe(MantaJob('test'))
  .map(wc(['-w']))
  .reduce(maggr('mean'))
  .pipe('~~/public/test.out')
  .on('end', function(job) {
    console.log(JSON.stringify(job, null, 2));
  });
```

or use your own module

in `stream/index.js`

```javascript
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
```

and in your `test.js`

```javascript
var mlang = require('../index');
mlang.pollute();

var job = MantaJob('test');

var ExampleStream = job.addPackage('./stream');

mfind('/manta/public/examples/shakespeare/')
  .pipe(job)
  .map(ExampleStream('king'))
  .reduce(sort().pipe(uniq('-c')).pipe(sort()))
  .pipe('~~/public/test.out')
  .on('end', function(job) {
    console.log(JSON.stringify(job, null, 2));
  });
```
