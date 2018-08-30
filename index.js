const crypto = require("crypto")
const fetch = require("node-fetch")

const baseURL = process.env.BASE_URL || "https://raw.githubusercontent.com/dotabuff/d2vpkr/master"
const secretToken = process.env.SECRET_TOKEN

const sources = {
  abilities: {
    dataURL: `${baseURL}/dota/scripts/npc/npc_abilities.json`,
    i18nURL: `${baseURL}/dota/resource/localization/abilities_english.json`,
    serializer: (data, i18n) => new AbilitiesSerializer(data, i18n),
  },
  heroes: {
    dataURL: `${baseURL}/dota/scripts/npc/npc_heroes.json`,
    serializer: (data) => new HeroesSerializer(data),
  },
  items: {
    dataURL: `${baseURL}/dota/scripts/npc/items.json`,
    i18nURL: `${baseURL}/dota/resource/dota_english.json`,
    serializer: (data, i18n) => new ItemsSerializer(data, i18n),
  },
}

module.exports.GetSource = async (req, res) => {
  const token = req.query.token

  if (secretToken && !secureCompare(secretToken, String(token))) {
    res.status(401).json({ error: "Unauthorized: Token is invalid" })
    return
  }

  const type = req.query.type

  if (!type) {
    res.status(400).json({ error: "Bad Request: Missing `type` query parameter" })
    return
  }

  const source = sources[type]

  if (!source) {
    res.status(400).json({ error: `Bad Request: Source '${type}' does not exist` })
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

const secureCompare = (a, b) => {
  const maxLen = Math.max(Buffer.byteLength(a), Buffer.byteLength(b))
  const bufA = Buffer.alloc(maxLen, 0, 'utf-8')
  const bufB = Buffer.alloc(maxLen, 0, 'utf-8')

  bufA.write(a)
  bufB.write(b)

  return crypto.timingSafeEqual(bufA, bufB)
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

const formatDescription = (description) => {
  return description
           .split(/(?:\\n|<br>)/)
           .map(stripHTMLTags)
           .map(stripExtraWhitespace)
}

const replaceAttributes = (description, attributes) => {
  if (!attributes) return description

  return description.replace(/%([^% ]*)%/g, (_, name) => {
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
      scepter: key.endsWith("_scepter"),
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
      const raw = this.abilities[key]
      const ability = {
        id: Number(raw.ID),
        key: key,
        name: stripExtraWhitespace(this.getString(key)),
        type: this.abilityTypes[raw.AbilityType],
      }

      if (ability.type === "talent") {
        return ability
      }

      const description = this.getString(key, "Description")
      const attributes = raw.AbilitySpecial && toObject(raw.AbilitySpecial)

      ability.description = description && this.getDescription(description, attributes)
      ability.notes = this.getNotes(key)
      ability.lore = this.getString(key, "Lore")
      ability.team_target = this.teamTargets[raw.AbilityUnitTargetTeam]
      ability.unit_targets = raw.AbilityUnitTargetType && this.getUnitTargets(raw.AbilityUnitTargetType)
      ability.damage_type = this.damageTypes[raw.AbilityUnitDamageType]
      ability.pierces_spell_immunity = this.spellImmunityTypes[raw.SpellImmunityType]
      ability.cast_range = raw.AbilityCastRange && toNumericSet(raw.AbilityCastRange)
      ability.cast_point = raw.AbilityCastPoint && toNumericSet(raw.AbilityCastPoint)
      ability.channel_time = raw.AbilityChannelTime && toNumericSet(raw.AbilityChannelTime)
      ability.duration = raw.AbilityDuration && toNumericSet(raw.AbilityDuration)
      ability.damage = raw.AbilityDamage && toNumericSet(raw.AbilityDamage)
      ability.cooldown = raw.AbilityCooldown && toNumericSet(raw.AbilityCooldown)
      ability.mana_cost = raw.AbilityManaCost && toNumericSet(raw.AbilityManaCost)
      ability.has_scepter_upgrade = raw.HasScepterUpgrade === "1"
      ability.is_granted_by_scepter = raw.IsGrantedByScepter === "1"
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

  getDescription(description, attributes) {
    return formatDescription(replaceAttributes(description, attributes))
  }

  getNotes(key) {
    const notes = []

    for(let i = 0; this.getString(key, `Note${i}`); i++) {
      notes.push(this.getString(key, `Note${i}`))
    }

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
      const raw = Object.assign({}, this.baseHero, this.heroes[key])

      return {
        id: Number(raw.HeroID),
        key: key,
        name: raw.workshop_guide_name,
        roles: raw.Role.split(",").map(r => r.toLowerCase()),
        complexity: Number(raw.Complexity),
        primary_attribute: this.primaryAttributes[raw.AttributePrimary],
        base_str: Number(raw.AttributeBaseStrength),
        base_agi : Number(raw.AttributeBaseAgility),
        base_int : Number(raw.AttributeBaseIntelligence),
        str_gain : Number(raw.AttributeStrengthGain),
        agi_gain : Number(raw.AttributeAgilityGain),
        int_gain : Number(raw.AttributeIntelligenceGain),
        base_health : Number(raw.StatusHealth),
        base_mana : Number(raw.StatusMana),
        base_health_regen : Number(raw.StatusHealthRegen),
        base_mana_regen : Number(raw.StatusManaRegen),
        attack_type: this.attackTypes[raw.AttackCapabilities],
        attack_range: Number(raw.AttackRange),
        attack_rate: Number(raw.AttackRate),
        base_attack_min: Number(raw.AttackDamageMin),
        base_attack_max: Number(raw.AttackDamageMax),
        base_armor: Number(raw.ArmorPhysical),
        base_magical_resistance: Number(raw.MagicalResistance),
        movement_speed: Number(raw.MovementSpeed),
        movement_turn_rate: Number(raw.MovementTurnRate),
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

class ItemsSerializer {
  constructor(data, i18n) {
    this.data = data
    this.strings = fixStringsCase(i18n.lang.Tokens)
  }

  serialize() {
    const items = this.keys.map((key) => {
      const raw = this.items[key]

      const description = this.getString(key, "Description")
      const attributes = raw.AbilitySpecial && toObject(raw.AbilitySpecial)

      return {
        id: Number(raw.ID),
        key: key,
        name: stripExtraWhitespace(this.getName(key, raw.ItemBaseLevel)),
        description: description && this.getDescription(description, attributes),
        notes: this.getNotes(key),
        lore: this.getString(key, "Lore"),
        recipe: key.startsWith("item_recipe"),
        cost: raw.ItemCost && parseInt(raw.ItemCost, 10),
        home_shop: raw.SideShop !== "1",
        side_shop: raw.SideShop === "1",
        secret_shop: raw.SecretShop === "1",
        cooldown: raw.AbilityCooldown && Number(raw.AbilityCooldown),
        mana_cost: raw.AbilityManaCost && Number(raw.AbilityManaCost),
        custom_attributes: attributes && formatCustomAttributes(attributes, this.strings, key),
        requirements: this.getRequirements(key),
      }
    }).sort((a, b) => a.id - b.id)

    items.forEach((item) => {
      item.upgrades = this.getUpgrades(items, item)
    })

    return items
  }

  get keys() {
    return Object.keys(this.items).filter(key => !this.ignoredKeys.includes(key))
  }

  get items() {
    return this.data.DOTAAbilities
  }

  get ignoredKeys() {
    return Object.keys(this.items).filter((key) => {
      return key.startsWith("item_recipe") && this.items[key].ItemCost === "0"
    }).concat("Version")
  }

  getName(key, level) {
    const name = this.getString(key)

    return level ? `${name} (level ${level})` : name
  }

  getString(key, suffix = "") {
    return this.strings[`DOTA_Tooltip_ability_${key}${ suffix && `_${suffix}`}`]
  }

  getDescription(description, attributes) {
    return replaceAttributes(description, attributes)
             .split(/\\n/)
             .map(this.formatAttribute)
  }

  formatAttribute(attribute) {
    if (!attribute.includes("<h1>")) {
      return {
        type: "hint",
        body: formatDescription(attribute),
      }
    } else {
      const regExp = /<h1>\s*(.*)\s*:\s*(.*)\s*<\/h1>\s*([\s\S]*)/gi
      const [_, type, header, body] = regExp.exec(attribute)

      return {
        type: type.toLowerCase(),
        header: header,
        body: formatDescription(body),
      }
    }
  }

  getNotes(key) {
    const notes = []

    for(let i = 0; this.getString(key, `Note${i}`); i++) {
      notes.push(this.getString(key, `Note${i}`))
    }

    return notes
  }

  getRequirements(key) {
    let k = key

    if (!k.startsWith("item_recipe")) {
      k = k.replace("item_", "item_recipe_")
    }

    const item = this.items[k]

    if (!item || !item.ItemRequirements || !item.ItemRequirements.length) {
      return []
    }

    const requirements = item.ItemRequirements[0].split(";")

    if (!k.startsWith("item_recipe") && item.ItemCost !== "0") {
      requirements.push(k)
    }

    return requirements
  }

  getUpgrades(items, item) {
    const upgrades = []

    items.filter(i => !i.recipe).forEach((i) => {
      if (i.requirements.includes(item.key)) {
        upgrades.push(i.key)
      }
    })

    return upgrades
  }
}
