/// <reference path="../pb_data/types.d.ts" />
// Server rules for Scent DNA that the database rules alone can't express.
// Note: PocketBase runs each handler on its own, so they can't share helper functions.

// Other people may see a member's name, photo and scent type next to their reviews.
// Everything else on the account stays private to its owner (and to you in the dashboard).
onRecordEnrich((e) => {
  const info = e.requestInfo
  const auth = info ? info.auth : null
  const owner = auth && (auth.id === e.record.id || auth.isSuperuser())
  if (!owner) e.record.hide("birthday", "favorites", "accords", "notes", "profile_made", "wishlist", "owned")
  e.next()
}, "users")

// Keep the like count on each review up to date.
onRecordAfterCreateSuccess((e) => {
  e.app.db().newQuery("UPDATE reviews SET likes = (SELECT COUNT(*) FROM review_likes WHERE review = {:id}) WHERE id = {:id}")
    .bind({ id: e.record.get("review") }).execute()
  e.next()
}, "review_likes")
onRecordAfterDeleteSuccess((e) => {
  e.app.db().newQuery("UPDATE reviews SET likes = (SELECT COUNT(*) FROM review_likes WHERE review = {:id}) WHERE id = {:id}")
    .bind({ id: e.record.get("review") }).execute()
  e.next()
}, "review_likes")

// Keep the reply count on each review up to date (counting only replies that are showing).
onRecordAfterCreateSuccess((e) => {
  e.app.db().newQuery("UPDATE reviews SET replies = (SELECT COUNT(*) FROM review_replies WHERE review = {:id} AND hidden = FALSE) WHERE id = {:id}")
    .bind({ id: e.record.get("review") }).execute()
  e.next()
}, "review_replies")
onRecordAfterDeleteSuccess((e) => {
  e.app.db().newQuery("UPDATE reviews SET replies = (SELECT COUNT(*) FROM review_replies WHERE review = {:id} AND hidden = FALSE) WHERE id = {:id}")
    .bind({ id: e.record.get("review") }).execute()
  e.next()
}, "review_replies")

// Can't like your own review, report your own words, or report the same thing twice.
onRecordCreateRequest((e) => {
  const rev = e.app.findRecordById("reviews", e.record.get("review"))
  if (e.auth && rev.get("user") === e.auth.id) throw new BadRequestError("You can't like your own review.")
  e.next()
}, "review_likes")
onRecordCreateRequest((e) => {
  const reviewId = e.record.get("review"), replyId = e.record.get("reply")
  if (!e.auth) throw new UnauthorizedError("Sign in to report.")
  if (!reviewId && !replyId) throw new BadRequestError("Choose what to report.")
  const target = reviewId ? e.app.findRecordById("reviews", reviewId) : e.app.findRecordById("review_replies", replyId)
  if (target.get("user") === e.auth.id) throw new BadRequestError("You can't report your own post.")
  const field = reviewId ? "review" : "reply"
  const dupe = e.app.findRecordsByFilter("reports", `user = {:u} && ${field} = {:t}`, "", 1, 0, { u: e.auth.id, t: target.id })
  if (dupe.length) throw new BadRequestError("You already reported this.")
  e.next()
}, "reports")

// After 3 different people report a review or a reply, hide it until you check it in the dashboard.
// To bring it back, untick "hidden" on the record.
onRecordAfterCreateSuccess((e) => {
  const reviewId = e.record.get("review"), replyId = e.record.get("reply")
  const field = reviewId ? "review" : "reply", id = reviewId || replyId
  const table = reviewId ? "reviews" : "review_replies"
  const row = new DynamicModel({ n: 0 })
  e.app.db().newQuery(`SELECT COUNT(DISTINCT user) AS n FROM reports WHERE ${field} = {:id}`).bind({ id: id }).one(row)
  if (row.n >= 3) {
    e.app.db().newQuery(`UPDATE ${table} SET hidden = TRUE WHERE id = {:id}`).bind({ id: id }).execute()
    if (replyId) {
      const rep = e.app.findRecordById("review_replies", replyId)
      e.app.db().newQuery("UPDATE reviews SET replies = (SELECT COUNT(*) FROM review_replies WHERE review = {:id} AND hidden = FALSE) WHERE id = {:id}")
        .bind({ id: rep.get("review") }).execute()
    }
  }
  e.next()
}, "reports")
