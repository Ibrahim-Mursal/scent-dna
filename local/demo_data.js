/// <reference path="../pb_data/types.d.ts" />
// Demo data for running Scent DNA on your own PC only. "Start Scent DNA.cmd" adds this file;
// it is never used on the real server. All demo passwords are demo12345.
migrate((app) => {
  const col = (n) => app.findCollectionByNameOrId(n)
  const user = (email, name, extra) => {
    const u = new Record(col("users"))
    u.setEmail(email); u.setPassword("demo12345"); u.setVerified(true)
    u.set("name", name)
    for (const k in (extra || {})) u.set(k, extra[k])
    app.save(u); return u
  }
  const me = user("ibrahim@demo.local", "Ibrahim", { role: "admin" })
  const shaOwner = user("sha@demo.local", "Sha Perfume", { role: "shop" })
  const origOwner = user("shop@demo.local", "Erbil Originals", { role: "shop" })
  const sara = user("sara@demo.local", "Sara Ahmed", { scent_type: "Warm Gourmand" })
  const omar = user("omar@demo.local", "Omar K.", { scent_type: "Woody Amber" })
  const lana = user("lana@demo.local", "Lana", { scent_type: "Fresh Citrus" })

  const shop = (data) => { const s = new Record(col("shops")); for (const k in data) s.set(k, data[k]); app.save(s); return s }
  const sha = shop({ name: "Sha Perfume", slug: "sha-perfume", kind: "oil", city: "Erbil", whatsapp: "+9647500000001", owner: shaOwner.id, active: true, sort: 2,
    about: "Perfume oils inspired by the world's favorite scents. Demo shop." })
  const orig = shop({ name: "Erbil Originals", slug: "erbil-originals", kind: "original", city: "Erbil", whatsapp: "+9647500000002", owner: origOwner.id, active: true, sort: 1,
    about: "Original perfumes, sealed bottles. Demo shop." })

  const product = (s, perfume, sizes, label) => {
    const p = new Record(col("products"))
    p.set("shop", s.id); p.set("perfume", perfume); p.set("sizes", sizes); p.set("in_stock", true); if (label) p.set("label", label)
    app.save(p); return p
  }
  // originals (catalog ids: Khamrah 75805, Baccarat Rouge 540 33519, Tobacco Vanille 1825, Sauvage 31861,
  // Club de Nuit Intense Man 34696, Asad 72821, Aventus 9828, Black Opium 25324)
  const pKhamrah = product(orig, 75805, [{ size: "100 ml", price: 45000 }])
  product(orig, 31861, [{ size: "60 ml", price: 120000 }, { size: "100 ml", price: 165000 }])
  product(orig, 34696, [{ size: "105 ml", price: 55000 }])
  product(orig, 72821, [{ size: "100 ml", price: 40000 }])
  product(orig, 25324, [{ size: "50 ml", price: 150000 }, { size: "90 ml", price: 210000 }])
  product(orig, 9828, [{ size: "100 ml", price: 520000 }])
  // oils
  const pNo21 = product(sha, 75805, [{ size: "10 ml", price: 7000 }, { size: "30 ml", price: 15000 }], "No. 21")
  product(sha, 33519, [{ size: "10 ml", price: 8000 }, { size: "30 ml", price: 18000 }], "No. 7")
  product(sha, 1825, [{ size: "10 ml", price: 8000 }, { size: "30 ml", price: 18000 }], "No. 33")
  product(sha, 9828, [{ size: "10 ml", price: 8000 }, { size: "30 ml", price: 18000 }], "No. 12")

  const review = (u, perfume, rating, text) => {
    const r = new Record(col("reviews"))
    r.set("user", u.id); r.set("perfume", perfume); r.set("rating", rating); r.set("text", text); r.set("likes", 0); r.set("replies", 0)
    app.save(r); return r
  }
  review(sara, 75805, 5, "Smells like dates and cinnamon at a winter wedding.\nLasts all day on me.")
  review(omar, 75805, 3, "Too sweet for summer here in Erbil.")
  review(lana, 75805, 4, "Lovely in the evening, a bit loud for the office.")
  review(sara, 33519, 4, "Beautiful but everyone wears it.")
  review(omar, 33519, 5, "")
  review(omar, 1825, 4, "Cozy.")
  review(lana, 31861, 4, "Fresh and easy, gets compliments.")

  const order = (p, s, size, price, qty, name, phone, city, item, kind) => {
    const o = new Record(col("orders"))
    o.set("product", p.id); o.set("shop", s.id); o.set("perfume", p.getInt("perfume")); o.set("item", item); o.set("kind", kind)
    o.set("size", size); o.set("price", price); o.set("qty", qty); o.set("total", price * qty)
    o.set("name", name); o.set("phone", phone); o.set("city", city); o.set("status", "pending")
    o.set("code", "SD-" + $security.randomStringWithAlphabet(5, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"))
    app.save(o)
  }
  order(pNo21, sha, "30 ml", 15000, 2, "Hana", "+9647701234567", "Duhok", "No. 21 (inspired by Khamrah by Lattafa Perfumes)", "oil")
  order(pKhamrah, orig, "100 ml", 45000, 1, "Dilan", "+9647502223344", "Erbil", "Khamrah by Lattafa Perfumes", "original")
}, (app) => {
  for (const email of ["ibrahim", "sha", "shop", "sara", "omar", "lana"]) {
    try { app.delete(app.findAuthRecordByEmail("users", email + "@demo.local")) } catch (_) {}
  }
  for (const slug of ["sha-perfume", "erbil-originals"]) {
    try { app.delete(app.findFirstRecordByData("shops", "slug", slug)) } catch (_) {}
  }
})
