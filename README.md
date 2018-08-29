# frog

[Google Cloud Function](https://cloud.google.com/functions/) that serves Dota 2 ability, hero and item data in a JSON format. It gets the data from the Steam source files through: [dotabuff/d2vpkr](https://github.com/dotabuff/d2vpkr).

## Usage

To try it in development, fire up the server with:

```
$ npm run server # or npm run s
```

To start getting data, make a request to:

```
GET http://localhost:1437/GetSource?type=<abilities|heroes|items>&pretty=[1]
```

| Query param | Required | Description
| ---- | -------- | -----------
| type | ✓ | Can be one of: `abilities`, `heroes`, or `items`.
| pretty | | Prettify JSON response.
