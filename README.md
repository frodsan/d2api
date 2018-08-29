# frog

[Google Cloud Function](https://cloud.google.com/functions/) that serves Dota 2 ability, hero and item data in a JSON format. It gets the data from the Steam source files through: [dotabuff/d2vpkr](https://github.com/dotabuff/d2vpkr).

## Requirements

- Node.js 8+

## Usage

To try it in development, fire up the server with:

```
$ npm run server # or npm run s
```

To start getting data, make a request to:

```
http://localhost:1437/GetSource
```

| Query param | Required | Description
| ---- | -------- | -----------
| type | ✓ | Can be one of: `abilities`, `heroes`, or `items`.
| pretty | | Prettify JSON response.

#### Example:

```
$ curl http://localhost:1437/GetSource?type=heroes | jq -s '.[0][0]'
{
  "id": 1,
  "key": "npc_dota_hero_antimage",
  "name": "Anti-Mage",
  "roles": [
    "carry",
    "escape",
    "nuker"
  ],
  "complexity": 1,
  "primary_attribute": "agi",
  "base_str": 23,
  "base_agi": 22,
  "base_int": 12,
  "str_gain": 1.3,
  "agi_gain": 2.8,
  "int_gain": 1.8,
  "base_health": 200,
  "base_mana": 75,
  "base_health_regen": 1.75,
  "base_mana_regen": 0.9,
  "attack_type": "melee",
  "attack_range": 150,
  "attack_rate": 1.4,
  "base_attack_min": 29,
  "base_attack_max": 33,
  "base_armor": -1,
  "base_magical_resistance": 25,
  "movement_speed": 310,
  "movement_turn_rate": 0.5
}
```

## Deployment

Use the `gcloud` utility, like:

```
$ gcloud beta functions deploy GetSource \
    --trigger-http \
    --runtime nodejs8 \
    --region <your-favorite-region>
Deploying function (may take a while - up to 2 minutes)...
```

The function can be triggered at https://[region]-[project_id].cloudfunctions.net/GetSource.

## License

Released under MIT License, check LICENSE file for details.
