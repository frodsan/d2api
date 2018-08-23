const fetch = require("node-fetch")

const baseURL = process.env.BASE_URL || "https://raw.githubusercontent.com/dotabuff/d2vpkr/master"

const sources = {
  abilities: {
    dataURL: `${baseURL}/dota/scripts/npc/npc_abilities.json`,
    i18nURL: `${baseURL}/dota/resource/localization/abilities_english.json`,
    serializer: (data, i18n) => new AbilitiesSerializer(data, i18n),
  },
  heroes: {
    dataURL: `${baseURL}/dota/scripts/npc/npc_heroes.json`,
    serializer: (data) => new HeroesSerializer(data),
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
    const promises = [source.dataURL, source.i18nURL].filter(u => u).map(fetch)
    const responses = await Promise.all(promises)
    const data = await responses[0].json()
    const i18n = responses[1] && await responses[1].json()
    const body = source.serializer(data, i18n).serialize()

    if (req.query.pretty) {
      res.header("Content-Type", "application/json")
      res.send(JSON.stringify(body, null, 2))
    } else {
      res.json(body)
    }
  } catch(e) {
    res.status(500).json({ error: `${e.name}: ${e.message}` })
  }
}

const fixStringsCase = (obj) => {
  const strings = Object.assign({}, obj)

  Object.keys(obj).forEach(key => {
    if (key.includes("DOTA_Tooltip_Ability_")) {
      strings[key.replace("DOTA_Tooltip_Ability_", "DOTA_Tooltip_ability_")] = obj[key]
    }
  })

  return strings
}

const stripExtraWhitespace = (str) => {
  return str && str.replace(/\s{2,}/g, " ").trim()
}

const stripHTMLTags = (str) => {
  return str.replace(/<[^>]*>/g, "")
}

const toObject = (obj) => {
  return !Array.isArray(obj) ? Object.values(obj) : obj
}

const toNumericSet = (str) => {
  return str.split(" ").map(Number).filter((v, i, arr) => arr.indexOf(v) === i)
}

const toPositiveNumericSet = (str) => {
  return toNumericSet(str).filter(n => n > 0)
}

const formatDescription = (description, attributes) => {
  let desc = description

  if (attributes) {
    desc = desc.replace(/%([^% ]*)%/g, (_, name) => {
      if (name === "") {
        return "%"
      }

      let attr = attributes.find(a => name in a)

      if (attr) {
        return attr[name]
      } else {
        return name
      }
    })
  }

  return desc
           .split(/(?:\\n|<br>)+/) // Split by newline tags.
           .map(stripHTMLTags)
           .map(stripExtraWhitespace)
}

const formatCustomAttributes = (attributes, strings, ability_key) => {
  return attributes.map((attr) => {
    let key = Object.keys(attr).find(key => `DOTA_Tooltip_ability_${ability_key}_${key}` in strings)

    if (!key) {
      return
    }

    let header = strings[`DOTA_Tooltip_ability_${ability_key}_${key}`]
    let prefix, suffix

    if (header.startsWith("%")) {
      header = header.substring(1)
      suffix = "%"
    }

    if (header.startsWith("+$")) {
      header = strings[`dota_ability_variable_${header.substring(2)}`]
      prefix = "+"
    }

    return {
      key: key,
      value: attr[key],
      scepter: key.endsWith("_scepter") || undefined,
      header: stripHTMLTags(header).replace(/\\n/g, ""),
      prefix: prefix,
      suffix: suffix,
    }
  }).filter(attr => attr)
}

class AbilitiesSerializer {
  constructor(data, i18n) {
    this.data = data
    this.strings = fixStringsCase(i18n.lang.Tokens)
  }

  serialize() {
    return this.keys.map((key) => {
      const a = this.abilities[key]
      const ability = {
        id: Number(a.ID),
        key: key,
        name: stripExtraWhitespace(this.getString(key)),
        type: this.abilityTypes[a.AbilityType],
      }

      if (ability.type === "talent") {
        return ability
      }

      const description = this.getString(key, "Description")
      const attributes = a.AbilitySpecial && toObject(a.AbilitySpecial)

      ability.description = description && formatDescription(description, attributes)
      ability.notes = this.getNotes(key)
      ability.lore = this.getString(key, "Lore")
      ability.team_target = this.teamTargets[a.AbilityUnitTargetTeam]
      ability.unit_targets = a.AbilityUnitTargetType && this.getUnitTargets(a.AbilityUnitTargetType)
      ability.damage_type = this.damageTypes[a.AbilityUnitDamageType]
      ability.pierces_spell_immunity = this.spellImmunityTypes[a.SpellImmunityType]
      ability.cast_range = a.AbilityCastRange && toPositiveNumericSet(a.AbilityCastRange)
      ability.cast_point = a.AbilityCastPoint && toPositiveNumericSet(a.AbilityCastPoint)
      ability.channel_time = a.AbilityChannelTime && toPositiveNumericSet(a.AbilityChannelTime)
      ability.duration = a.AbilityDuration && toPositiveNumericSet(a.AbilityDuration)
      ability.damage = a.AbilityDamage && toPositiveNumericSet(a.AbilityDamage)
      ability.mana_cost = a.AbilityManaCost && toNumericSet(a.AbilityManaCost)
      ability.cooldown = a.AbilityCooldown && toNumericSet(a.AbilityCooldown)
      ability.has_scepter_upgrade = a.HasScepterUpgrade === "1"
      ability.is_granted_by_scepter = a.IsGrantedByScepter === "1"
      ability.custom_attributes = attributes && formatCustomAttributes(attributes, this.strings, key)

      return ability
    }).sort((a, b) => a.id - b.id)
  }

  get keys() {
    return Object.keys(this.abilities).filter(id => !this.ignoredKeys.includes(id))
  }

  get abilities() {
    return this.data.DOTAAbilities
  }

  get ignoredKeys() {
    return [
      "Version",
      "ability_base",
      "ability_deward",
      "attribute_bonus",
      "default_attack",
      "dota_base_ability",
    ]
  }

  getString(key, suffix = "") {
    return this.strings[`DOTA_Tooltip_ability_${key}${ suffix && `_${suffix}`}`]
  }

  getNotes(key) {
    const notes = []

    for(let i = 0; this.getString(key, `Note${i}`); i++)
      notes.push(this.getString(key, `Note${i}`))

    return notes
  }

  getUnitTargets(targets) {
    return targets.split(" | ").map(t => this.teamTargets[t]).filter(t => t)
  }

  get abilityTypes() {
    return new Proxy(
      {
        DOTA_ABILITY_TYPE_ATTRIBUTES: "talent",
        DOTA_ABILITY_TYPE_ULTIMATE: "ultimate",
      },
      {
        get: (dict, k) => dict[k] || "basic",
      }
    )
  }

  get teamTargets() {
    return {
      DOTA_UNIT_TARGET_TEAM_BOTH: "both",
      DOTA_UNIT_TARGET_TEAM_ENEMY: "enemy",
      DOTA_UNIT_TARGET_TEAM_FRIENDLY: "ally",
      "DOTA_UNIT_TARGET_TEAM_ENEMY | DOTA_UNIT_TARGET_TEAM_FRIENDLY": "both",
      "DOTA_UNIT_TARGET_TEAM_FRIENDLY | DOTA_UNIT_TARGET_TEAM_ENEMY": "both",
    }
  }

  get unitTargets() {
    return {
      DOTA_UNIT_TARGET_BASIC: "creep",
      DOTA_UNIT_TARGET_BUILDING: "building",
      DOTA_UNIT_TARGET_CREEP: "creep",
      DOTA_UNIT_TARGET_HERO: "hero",
    }
  }

  get damageTypes() {
    return {
      DAMAGE_TYPE_MAGICAL: "magical",
      DAMAGE_TYPE_PHYSICAL: "physical",
      DAMAGE_TYPE_PURE: "pure",
    }
  }

  get spellImmunityTypes() {
    return {
      SPELL_IMMUNITY_ALLIES_NO: false,
      SPELL_IMMUNITY_ALLIES_YES: true,
      SPELL_IMMUNITY_ENEMIES_YES: true,
      SPELL_IMMUNITY_ENEMIES_NO: false,
    }
  }
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
