const fetch = require("node-fetch")

const baseURL = process.env.BASE_URL || "https://raw.githubusercontent.com/dotabuff/d2vpkr/master"

const sources = {
  abilities: {
    dataURL: `${baseURL}/dota/scripts/npc/npc_abilities.json`,
    i18nURL: `${baseURL}/dota/resource/localization/abilities_english.json`,
  },
  heroes: {
    dataURL: `${baseURL}/dota/scripts/npc/npc_heroes.json`,
  }
}

module.exports.GetSource = async (req, res) => {
  const type = req.query.type

  if (!type) {
    res.status(400).json({ error: "Missing `type` query parameter" })
    return
  }

  const source = sources[type]

  if (!source) {
    res.status(400).json({ error: `Source '${type}' does not exist` })
    return
  }

  try {
    const promises = [source.dataURL, source.stringsURL].filter(u => u).map(fetch)
    const responses = await Promise.all(promises)
    const data = await responses[0].json()
    const i18n = responses[1] && await responses[1].json()
    const body = newSerializer(type, data, i18n).serialize()


    if (req.query.pretty) {
      res.header("Content-Type", "application/json")
      res.send(JSON.stringify(body, null, 2))
    } else {
      res.json(body)
    }
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
}

const newSerializer = (type, data, i18n) => {
  let serializer

  switch (type) {
    case "abilities": serializer = AbilitiesSerializer
    case "heroes": serializer = HeroesSerializer
  }

  return new serializer(data, i18n)
}

class HeroesSerializer {
  constructor(data) {
    this.data = data
  }

  serialize() {
    return this.keys.map((key) => {
      const h = Object.assign({}, this.baseHero, this.heroes[key])

      return {
        id: Number(h.HeroID),
        key: key,
        name: h.workshop_guide_name,
        roles: h.Role.split(",").map(r => r.toLowerCase()),
        complexity: Number(h.Complexity),
        primary_attribute: this.primaryAttributes[h.AttributePrimary],
        base_str: Number(h.AttributeBaseStrength),
        base_agi : Number(h.AttributeBaseAgility),
        base_int : Number(h.AttributeBaseIntelligence),
        str_gain : Number(h.AttributeStrengthGain),
        agi_gain : Number(h.AttributeAgilityGain),
        int_gain : Number(h.AttributeIntelligenceGain),
        base_health : Number(h.StatusHealth),
        base_mana : Number(h.StatusMana),
        base_health_regen : Number(h.StatusHealthRegen),
        base_mana_regen : Number(h.StatusManaRegen),
        attack_type: this.attackTypes[h.AttackCapabilities],
        attack_range: Number(h.AttackRange),
        attack_rate: Number(h.AttackRate),
        base_attack_min: Number(h.AttackDamageMin),
        base_attack_max: Number(h.AttackDamageMax),
        base_armor: Number(h.ArmorPhysical),
        base_magical_resistance: Number(h.MagicalResistance),
        movement_speed: Number(h.MovementSpeed),
        movement_turn_rate: Number(h.MovementTurnRate),
      }
    }).sort((a, b) => a.id - b.id)
  }

  get keys() {
    return Object.keys(this.heroes).filter(key => !this.ignoredKeys.includes(key))
  }

  get heroes() {
    return this.data.DOTAHeroes
  }

  get ignoredKeys() {
    return [
      "Version",
      "npc_dota_hero_base",
      "npc_dota_hero_target_dummy",
    ]
  }

  get baseHero() {
    return this.heroes.npc_dota_hero_base
  }

  get primaryAttributes() {
    return {
      DOTA_ATTRIBUTE_STRENGTH: "str",
      DOTA_ATTRIBUTE_AGILITY: "agi",
      DOTA_ATTRIBUTE_INTELLECT: "int",
    }
  }

  get attackTypes() {
    return {
      DOTA_UNIT_CAP_MELEE_ATTACK: "melee",
      DOTA_UNIT_CAP_RANGED_ATTACK: "ranged",
    }
  }
}
