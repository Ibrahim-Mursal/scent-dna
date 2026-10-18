/// <reference path="../pb_data/types.d.ts" />
// Shops and orders.
//   users.role   "admin" = you (approve orders, manage shops), "shop" = a shop owner. Set "admin" on your own
//                account in the dashboard (users -> your record -> role). Shop owners are set from the site's admin page.
//   shops        3-4 partner shops. kind "original" sells original bottles, kind "oil" sells perfume oils
//                inspired by a perfume (like Sha Perfume).
//   products     a shop's listing of one perfume from the catalog, with its sizes and prices.
//   orders       every order goes to you first; you approve it and send it to the shop on WhatsApp.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new SelectField({ name: "role", values: ["admin", "shop"], maxSelect: 1 }))
  // members can't give themselves a role
  users.updateRule = "id = @request.auth.id && @request.body.role:isset = false"
  app.save(users)

  const isAdmin = "@request.auth.role = 'admin'"
  const created = { name: "created", type: "autodate", onCreate: true, onUpdate: false }
  const updated = { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
  const image = { maxSelect: 1, maxSize: 3145728, mimeTypes: ["image/jpeg", "image/png", "image/webp"], thumbs: ["400x400", "200x200"] }

  const shops = new Collection({
    type: "base",
    name: "shops",
    fields: [
      { name: "name", type: "text", required: true, max: 60 },
      { name: "slug", type: "text", required: true, max: 40, pattern: "^[a-z0-9-]+$" },
      { name: "kind", type: "select", required: true, values: ["original", "oil"], maxSelect: 1 },
      { name: "about", type: "text", max: 400 },
      { name: "city", type: "text", max: 60 },
      { name: "logo", type: "file", ...image },
      { name: "whatsapp", type: "text", max: 20 },       // where approved orders are sent; hidden from the public
      { name: "owner", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "active", type: "bool" },
      { name: "sort", type: "number", onlyInt: true },
      created, updated,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_shops_slug ON shops (slug)"],
    listRule: `active = true || owner = @request.auth.id || ${isAdmin}`,
    viewRule: `active = true || owner = @request.auth.id || ${isAdmin}`,
    createRule: isAdmin,
    // owners edit their details; pb_hooks stops them changing name, slug, kind, owner or active
    updateRule: `owner = @request.auth.id || ${isAdmin}`,
    deleteRule: isAdmin,
  })
  app.save(shops)

  const products = new Collection({
    type: "base",
    name: "products",
    fields: [
      { name: "shop", type: "relation", required: true, collectionId: shops.id, maxSelect: 1, cascadeDelete: true },
      { name: "perfume", type: "number", required: true, onlyInt: true, min: 1 },   // catalog id (for oils: the perfume it's inspired by)
      { name: "label", type: "text", max: 60 },                                       // the shop's own name for it, e.g. "No. 21"
      { name: "sizes", type: "json", maxSize: 4000 },                                 // [{"size": "100 ml", "price": 45000}, ...]
      { name: "in_stock", type: "bool" },
      { name: "photo", type: "file", ...image },
      { name: "note", type: "text", max: 300 },
      created, updated,
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_products_shop_perfume ON products (shop, perfume)",
      "CREATE INDEX idx_products_perfume ON products (perfume)",
    ],
    listRule: `shop.active = true || shop.owner = @request.auth.id || ${isAdmin}`,
    viewRule: `shop.active = true || shop.owner = @request.auth.id || ${isAdmin}`,
    // pb_hooks checks that the shop in the request belongs to you
    createRule: "@request.auth.id != ''",
    updateRule: `shop.owner = @request.auth.id || ${isAdmin}`,
    deleteRule: `shop.owner = @request.auth.id || ${isAdmin}`,
  })
  app.save(products)

  const orders = new Collection({
    type: "base",
    name: "orders",
    fields: [
      { name: "code", type: "text", max: 20 },
      { name: "product", type: "relation", collectionId: products.id, maxSelect: 1, cascadeDelete: false },
      { name: "shop", type: "relation", collectionId: shops.id, maxSelect: 1, cascadeDelete: false },
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      // copies taken when the order is placed, so the order stays readable if the listing changes later
      { name: "perfume", type: "number", onlyInt: true },
      { name: "item", type: "text", max: 200 },
      { name: "kind", type: "text", max: 20 },
      { name: "size", type: "text", max: 40 },
      { name: "price", type: "number", onlyInt: true, min: 0 },
      { name: "qty", type: "number", onlyInt: true, min: 1, max: 20 },
      { name: "total", type: "number", onlyInt: true, min: 0 },
      { name: "name", type: "text", required: true, max: 80 },
      { name: "phone", type: "text", required: true, max: 20 },
      { name: "city", type: "text", required: true, max: 60 },
      { name: "address", type: "text", max: 300 },
      { name: "note", type: "text", max: 500 },
      { name: "status", type: "select", values: ["pending", "approved", "rejected", "delivered", "cancelled"], maxSelect: 1 },
      { name: "admin_note", type: "text", max: 300 },
      { name: "approved_at", type: "date" },
      created, updated,
    ],
    indexes: ["CREATE INDEX idx_orders_status ON orders (status)", "CREATE INDEX idx_orders_shop ON orders (shop)", "CREATE INDEX idx_orders_user ON orders (user)"],
    // you see every order; a customer sees their own; a shop sees its orders only after you approve them
    listRule: `${isAdmin} || (@request.auth.id != '' && user = @request.auth.id) || (@request.auth.id != '' && shop.owner = @request.auth.id && status != 'pending' && status != 'rejected')`,
    viewRule: `${isAdmin} || (@request.auth.id != '' && user = @request.auth.id) || (@request.auth.id != '' && shop.owner = @request.auth.id && status != 'pending' && status != 'rejected')`,
    // anyone can order, signed in or not; pb_hooks fills in the price and checks everything
    createRule: "",
    // pb_hooks limits what shops and customers may change
    updateRule: `${isAdmin} || (@request.auth.id != '' && user = @request.auth.id && status = 'pending') || (@request.auth.id != '' && shop.owner = @request.auth.id && status = 'approved')`,
    deleteRule: null,
  })
  app.save(orders)

  // at most 10 orders a minute from one internet address (mobile networks share addresses, so not lower)
  const settings = app.settings()
  settings.rateLimits.rules.push({ label: "orders:create", audience: "", duration: 60, maxRequests: 10 })
  app.save(settings)
}, (app) => {
  for (const name of ["orders", "products", "shops"]) {
    try { app.delete(app.findCollectionByNameOrId(name)) } catch (_) {}
  }
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("role")
  users.updateRule = "id = @request.auth.id"
  app.save(users)
  const settings = app.settings()
  settings.rateLimits.rules = settings.rateLimits.rules.filter((r) => r.label !== "orders:create")
  app.save(settings)
})
