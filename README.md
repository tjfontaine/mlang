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
