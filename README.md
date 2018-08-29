# frog

[Google Cloud Function](https://cloud.google.com/functions/) that serves Dota 2 ability, hero and item data in a JSON format. It gets the data from the Steam source files through: [dotabuff/d2vpkr](https://github.com/dotabuff/d2vpkr).

## Usage

To try it in development, run:

```
$ npm run server # or npm run s
```

This will fire up a server running on <http://localhost:1437>. In order to get a JSON response, you need to request the `/GetSource` resource, like:

```
http://localhost:1437/GetSource?type=<abilities|heroes|items>
```
