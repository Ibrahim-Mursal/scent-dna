/// <reference path="../pb_data/types.d.ts" />
// Community: reviews with star ratings, likes, replies and reports, plus a "Want to try" and
// "I own it" list on each account. Also sets the app name, the password reset link and rate limiting.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new JSONField({ name: "wishlist", maxSize: 20000 }))
  users.fields.add(new JSONField({ name: "owned", maxSize: 20000 }))
  users.fields.add(new TextField({ name: "scent_type", max: 60 }))
  // Anyone can look up a member by id, so reviews can show the author's name, photo and scent type.
  // pb_hooks/scentdna.pb.js hides everything else (birthday, favorites, lists) from other people.
  // Listing all members stays owner-only.
  users.viewRule = ""
  // the reset email links to the site's own "choose a new password" page
  users.resetPasswordTemplate.body = users.resetPasswordTemplate.body.replace(
    "{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}", "{APP_URL}/#reset/{TOKEN}")
  app.save(users)

  const me = "@request.auth.id != '' && @request.auth.collectionName = 'users' && @request.body.user = @request.auth.id"
  const created = { name: "created", type: "autodate", onCreate: true, onUpdate: false }
  const updated = { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
  const author = { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }

  const reviews = new Collection({
    type: "base",
    name: "reviews",
    fields: [
      author,
      { name: "perfume", type: "number", required: true, onlyInt: true, min: 1 },
      { name: "rating", type: "number", required: true, onlyInt: true, min: 1, max: 5 },
      { name: "text", type: "text", max: 1500 },
      { name: "likes", type: "number", onlyInt: true, min: 0 },
      { name: "replies", type: "number", onlyInt: true, min: 0 },
      { name: "hidden", type: "bool" },
      created, updated,
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_reviews_user_perfume ON reviews (user, perfume)",
      "CREATE INDEX idx_reviews_perfume ON reviews (perfume)",
      "CREATE INDEX idx_reviews_created ON reviews (created)",
    ],
    // hidden = taken down after reports; the author still sees it
    listRule: "hidden = false || user = @request.auth.id",
    viewRule: "hidden = false || user = @request.auth.id",
    createRule: me + " && @request.body.likes:isset = false && @request.body.replies:isset = false && @request.body.hidden:isset = false",
    updateRule: "user = @request.auth.id && @request.body.user:isset = false && @request.body.perfume:isset = false && @request.body.likes:isset = false && @request.body.replies:isset = false && @request.body.hidden:isset = false",
    deleteRule: "user = @request.auth.id",
  })
  app.save(reviews)

  const replies = new Collection({
    type: "base",
    name: "review_replies",
    fields: [
      author,
      { name: "review", type: "relation", required: true, collectionId: reviews.id, maxSelect: 1, cascadeDelete: true },
      { name: "text", type: "text", required: true, max: 800 },
      { name: "hidden", type: "bool" },
      created, updated,
    ],
    indexes: ["CREATE INDEX idx_replies_review ON review_replies (review)"],
    listRule: "hidden = false || user = @request.auth.id",
    viewRule: "hidden = false || user = @request.auth.id",
    createRule: me + " && @request.body.hidden:isset = false",
    updateRule: null,
    deleteRule: "user = @request.auth.id",
  })
  app.save(replies)

  const likes = new Collection({
    type: "base",
    name: "review_likes",
    fields: [
      author,
      { name: "review", type: "relation", required: true, collectionId: reviews.id, maxSelect: 1, cascadeDelete: true },
      created,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_likes_user_review ON review_likes (user, review)"],
    listRule: "user = @request.auth.id",   // you can only see which reviews you liked
    viewRule: "user = @request.auth.id",
    createRule: me,
    updateRule: null,
    deleteRule: "user = @request.auth.id",
  })
  app.save(likes)

  const reports = new Collection({
    type: "base",
    name: "reports",
    fields: [
      author,
      { name: "review", type: "relation", collectionId: reviews.id, maxSelect: 1, cascadeDelete: true },
      { name: "reply", type: "relation", collectionId: replies.id, maxSelect: 1, cascadeDelete: true },
      { name: "reason", type: "text", max: 300 },
      created,
    ],
    indexes: ["CREATE INDEX idx_reports_review ON reports (review)", "CREATE INDEX idx_reports_reply ON reports (reply)"],
    // only you (in the dashboard) can read reports
    listRule: null, viewRule: null, createRule: me, updateRule: null, deleteRule: null,
  })
  app.save(reports)

  // average rating, review count and the 1-5 star spread for every reviewed perfume
  const stats = new Collection({
    type: "view",
    name: "perfume_stats",
    listRule: "",
    viewRule: "",
    viewQuery: `SELECT CAST(perfume AS TEXT) AS id, perfume, COUNT(*) AS reviews, ROUND(AVG(rating), 2) AS avg,
        SUM(rating = 1) AS s1, SUM(rating = 2) AS s2, SUM(rating = 3) AS s3, SUM(rating = 4) AS s4, SUM(rating = 5) AS s5,
        MAX(created) AS last
      FROM reviews WHERE hidden = FALSE GROUP BY perfume`,
  })
  app.save(stats)

  const settings = app.settings()
  settings.meta.appName = "Scent DNA"
  settings.meta.senderName = "Scent DNA"
  const domain = $os.getenv("SCENTDNA_DOMAIN")
  if (domain) settings.meta.appURL = "https://" + domain
  settings.rateLimits.enabled = true
  app.save(settings)
}, (app) => {
  for (const name of ["perfume_stats", "reports", "review_likes", "review_replies", "reviews"]) {
    try { app.delete(app.findCollectionByNameOrId(name)) } catch (_) {}
  }
  const users = app.findCollectionByNameOrId("users")
  for (const f of ["wishlist", "owned", "scent_type"]) users.fields.removeByName(f)
  users.viewRule = "id = @request.auth.id"
  users.resetPasswordTemplate.body = users.resetPasswordTemplate.body.replace(
    "{APP_URL}/#reset/{TOKEN}", "{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}")
  app.save(users)
})
