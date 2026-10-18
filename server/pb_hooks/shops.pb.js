/// <reference path="../pb_data/types.d.ts" />
// Shops, their perfumes, and orders. Each handler runs on its own, so shared helpers come from scentdna_utils.js.

// ---------- shops ----------
// The public never sees a shop's WhatsApp number or owner; orders reach shops through you.
onRecordEnrich((e) => {
  const u = require(`${__hooks}/scentdna_utils.js`)
  const auth = e.requestInfo ? e.requestInfo.auth : null
  if (!(u.isAdmin(auth) || (auth && auth.id === e.record.getString("owner")))) e.record.hide("whatsapp", "owner")
  e.next()
}, "shops")

onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/scentdna_utils.js`)
  e.record.set("slug", e.record.getString("slug").toLowerCase())
  const wa = e.record.getString("whatsapp")
  if (wa) { const n = u.normPhone(wa); if (!n) throw new BadRequestError("Check the shop's WhatsApp number, for example 0750 123 4567."); e.record.set("whatsapp", n) }
  e.next()
}, "shops")

// Shop owners can change their description, city, logo and WhatsApp number. Only you change the rest.
onRecordUpdateRequest((e) => {
  const u = require(`${__hooks}/scentdna_utils.js`)
  if (!u.isAdmin(e.auth)) {
    const body = e.requestInfo().body
    for (const k of ["name", "slug", "kind", "owner", "active", "sort"]) if (k in body) throw new ForbiddenError("Only the site admin can change that.")
  }
  const wa = e.record.getString("whatsapp")
  if (wa) { const n = u.normPhone(wa); if (!n) throw new BadRequestError("Check the WhatsApp number, for example 0750 123 4567."); e.record.set("whatsapp", n) }
  e.next()
}, "shops")

// ---------- a shop's perfumes ----------
onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/scentdna_utils.js`)
  if (!e.auth) throw new UnauthorizedError("Sign in first.")
  let shop
  try { shop = e.app.findRecordById("shops", e.record.getString("shop")) } catch (_) { throw new BadRequestError("Choose a shop.") }
  if (!u.isAdmin(e.auth) && shop.getString("owner") !== e.auth.id) throw new ForbiddenError("You can only add perfumes to your own shop.")
  e.record.set("sizes", u.cleanSizes(e.record.getString("sizes")))
  e.next()
}, "products")

onRecordUpdateRequest((e) => {
  const u = require(`${__hooks}/scentdna_utils.js`)
  if (e.record.getString("shop") !== e.record.original().getString("shop") && !u.isAdmin(e.auth)) throw new ForbiddenError("A perfume can't be moved to another shop.")
  if (e.record.getString("perfume") !== e.record.original().getString("perfume") && !u.isAdmin(e.auth)) throw new BadRequestError("To list a different perfume, add it as a new one.")
  e.record.set("sizes", u.cleanSizes(e.record.getString("sizes")))
  e.next()
}, "products")

// ---------- orders ----------
// Anyone can order. The price, shop and status come from the server, never from the browser.
onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/scentdna_utils.js`)
  const r = e.record
  let product, shop
  try { product = e.app.findRecordById("products", r.getString("product")); shop = e.app.findRecordById("shops", product.getString("shop")) }
  catch (_) { throw new BadRequestError("That perfume isn't available any more.") }
  if (!shop.getBool("active") || !product.getBool("in_stock")) throw new BadRequestError("That perfume isn't available right now.")
  const sizes = u.cleanSizes(product.getString("sizes"))
  const pick = sizes.find((s) => s.size === r.getString("size"))
  if (!pick) throw new BadRequestError("Choose one of the sizes the shop offers.")
  const qty = r.getInt("qty") || 1
  if (qty < 1 || qty > 20) throw new BadRequestError("You can order 1 to 20 at a time.")
  const name = r.getString("name").trim()
  if (name.length < 2) throw new BadRequestError("Add your name.")
  const phone = u.normPhone(r.getString("phone"))
  if (!phone) throw new BadRequestError("Enter your WhatsApp number, for example 0750 123 4567.")
  if (!r.getString("city").trim()) throw new BadRequestError("Choose your city.")
  r.set("name", name); r.set("phone", phone)
  r.set("shop", shop.id); r.set("perfume", product.getInt("perfume")); r.set("kind", shop.getString("kind"))
  r.set("size", pick.size); r.set("price", pick.price); r.set("qty", qty); r.set("total", pick.price * qty)
  r.set("status", "pending"); r.set("admin_note", ""); r.set("approved_at", "")
  r.set("user", e.auth && !e.auth.isSuperuser() ? e.auth.id : "")
  r.set("code", "SD-" + $security.randomStringWithAlphabet(5, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"))
  e.next()
}, "orders")

// Who may change what:
//   you: status (approve, reject, delivered, cancelled) and a note
//   the customer: cancel their own order while it's waiting
//   the shop: mark an approved order delivered or cancelled
onRecordUpdateRequest((e) => {
  const u = require(`${__hooks}/scentdna_utils.js`)
  const before = e.record.original(), body = e.requestInfo().body, keys = Object.keys(body)
  const from = before.getString("status"), to = e.record.getString("status")
  const only = (allowed) => { for (const k of keys) if (!allowed.includes(k)) throw new ForbiddenError("You can't change that on an order.") }
  if (u.isAdmin(e.auth)) {
    only(["status", "admin_note"])
    if (to === "approved" && from !== "approved") e.record.set("approved_at", new DateTime())
  } else if (e.auth && before.getString("user") === e.auth.id && from === "pending") {
    only(["status"])
    if (to !== "cancelled") throw new ForbiddenError("You can only cancel your order.")
  } else {
    only(["status"])
    if (!(from === "approved" && (to === "delivered" || to === "cancelled"))) throw new ForbiddenError("Shops can mark an approved order as delivered or cancelled.")
  }
  e.next()
}, "orders")

// Email you about every new order (works once email sending is set up in Settings -> Mail settings).
onRecordAfterCreateSuccess((e) => {
  try {
    const settings = e.app.settings()
    if (settings.smtp.enabled) {
      const r = e.record, meta = settings.meta
      const admins = e.app.findRecordsByFilter("users", "role = 'admin'", "", 20, 0)
      const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
      const html = `<p>New order <b>${r.getString("code")}</b> is waiting for you.</p>
        <p>${r.getString("item")}<br>${r.getString("size")} × ${r.getInt("qty")}: ${money(r.getInt("total"))} IQD<br>
        ${r.getString("name")}, ${r.getString("city")}</p>
        <p><a href="${meta.appURL}/#admin">Open your orders</a></p>`
      for (const a of admins) {
        e.app.newMailClient().send(new MailerMessage({
          from: { address: meta.senderAddress, name: meta.senderName },
          to: [{ address: a.email() }],
          subject: `New order ${r.getString("code")}`,
          html,
        }))
      }
    }
  } catch (err) {
    console.log("order email failed:", err)
  }
  e.next()
}, "orders")

// ---------- admin tools ----------
// Make the account with this email the owner of a shop. The owner must have created an account on the site first.
routerAdd("POST", "/api/scentdna/shop-owner", (e) => {
  const u = require(`${__hooks}/scentdna_utils.js`)
  if (!u.isAdmin(e.auth)) throw new ForbiddenError("Only the site admin can do this.")
  const body = e.requestInfo().body
  let shop, user
  try { shop = e.app.findRecordById("shops", String(body.shop || "")) } catch (_) { throw new NotFoundError("That shop doesn't exist.") }
  try { user = e.app.findAuthRecordByEmail("users", String(body.email || "").trim().toLowerCase()) }
  catch (_) { throw new NotFoundError("No account uses that email. Ask the shop owner to create an account on the site first, then try again.") }
  if (user.getString("role") !== "admin") { user.set("role", "shop"); e.app.save(user) }
  shop.set("owner", user.id)
  e.app.save(shop)
  return e.json(200, { owner: user.id, name: user.getString("name"), email: user.email() })
}, $apis.requireAuth())

// The owners' emails, for your shops list (emails are otherwise private).
routerAdd("GET", "/api/scentdna/shop-owners", (e) => {
  const u = require(`${__hooks}/scentdna_utils.js`)
  if (!u.isAdmin(e.auth)) throw new ForbiddenError("Only the site admin can do this.")
  const out = {}
  for (const s of e.app.findAllRecords("shops")) {
    const id = s.getString("owner")
    if (id) { try { const o = e.app.findRecordById("users", id); out[s.id] = { name: o.getString("name"), email: o.email() } } catch (_) {} }
  }
  return e.json(200, out)
}, $apis.requireAuth())
