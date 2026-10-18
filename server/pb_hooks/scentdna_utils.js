// Helpers shared by the shop and order hooks (loaded with require inside each hook).
module.exports = {
  // true for you (role "admin") or a PocketBase superuser
  isAdmin(auth) {
    return !!auth && (auth.isSuperuser() || auth.getString("role") === "admin")
  },

  // Turns what people type into +9647501234567. Iraqi numbers may start with 07, 7, 964, +964 or 00964.
  // Other countries need the + or 00 prefix. Returns "" if it doesn't look like a phone number.
  normPhone(input) {
    let d = String(input || "").trim().replace(/[\s\-().]/g, "")
    if (d.startsWith("+")) d = d.slice(1)
    else if (d.startsWith("00")) d = d.slice(2)
    else if (/^07\d{9}$/.test(d)) d = "964" + d.slice(1)
    else if (/^7\d{9}$/.test(d)) d = "964" + d
    if (!/^\d+$/.test(d)) return ""
    if (d.startsWith("964")) return /^9647\d{9}$/.test(d) ? "+" + d : ""
    return d.length >= 8 && d.length <= 15 ? "+" + d : ""
  },

  // [{"size": "100 ml", "price": 45000}, ...] with 1 to 8 sizes; prices in IQD
  cleanSizes(raw) {
    let list = raw
    if (typeof list === "string") { try { list = JSON.parse(list || "[]") } catch (_) { list = null } }
    if (!Array.isArray(list)) throw new BadRequestError("Add at least one size with a price.")
    const out = []
    for (const s of list) {
      const size = String((s && s.size) || "").trim().slice(0, 20)
      const price = Math.round(Number(s && s.price))
      if (!size && !price) continue
      if (!size) throw new BadRequestError("Every price needs a size, for example 100 ml.")
      if (!(price >= 250 && price <= 10000000)) throw new BadRequestError(`Check the price for ${size}. Prices are in IQD, for example 45000.`)
      out.push({ size, price })
    }
    if (!out.length) throw new BadRequestError("Add at least one size with a price.")
    if (out.length > 8) throw new BadRequestError("Up to 8 sizes per perfume.")
    return out
  },
}
