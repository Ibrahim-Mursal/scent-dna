/// <reference path="../pb_data/types.d.ts" />
// Numbers for the Community page: totals, and the members who write the most reviews.
migrate((app) => {
  const totals = new Collection({
    type: "view",
    name: "community_stats",
    listRule: "",
    viewRule: "",
    viewQuery: `SELECT 'all' AS id,
        (SELECT COUNT(*) FROM users) AS members,
        (SELECT COUNT(*) FROM reviews WHERE hidden = FALSE) AS reviews,
        (SELECT COUNT(DISTINCT perfume) FROM reviews WHERE hidden = FALSE) AS perfumes`,
  })
  app.save(totals)

  // "member" is a link to the user, so the site can show their name, photo and scent type
  const top = new Collection({
    type: "view",
    name: "top_reviewers",
    listRule: "",
    viewRule: "",
    viewQuery: `SELECT r.user AS id, r.user AS member, COUNT(r.id) AS reviews, COALESCE(SUM(r.likes), 0) AS likes, MAX(r.created) AS last
      FROM reviews r WHERE r.hidden = FALSE GROUP BY r.user`,
  })
  app.save(top)
}, (app) => {
  for (const name of ["top_reviewers", "community_stats"]) {
    try { app.delete(app.findCollectionByNameOrId(name)) } catch (_) {}
  }
})
