/// <reference path="../pb_data/types.d.ts" />
// Scent DNA: adds the profile answers to the built-in "users" collection.
// Name and photo use the collection's own "name" and "avatar" fields.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")

  users.fields.add(new DateField({ name: "birthday" }))
  users.fields.add(new JSONField({ name: "favorites", maxSize: 20000 }))   // perfume IDs
  users.fields.add(new JSONField({ name: "accords", maxSize: 20000 }))     // accord indexes
  users.fields.add(new JSONField({ name: "notes", maxSize: 20000 }))       // note indexes
  users.fields.add(new TextField({ name: "profile_made", max: 10 }))      // YYYY-MM-DD the profile was finished

  // each person can only see and change their own account
  users.listRule = "id = @request.auth.id"
  users.viewRule = "id = @request.auth.id"
  users.updateRule = "id = @request.auth.id"
  users.deleteRule = "id = @request.auth.id"

  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  for (const f of ["birthday", "favorites", "accords", "notes", "profile_made"]) users.fields.removeByName(f)
  app.save(users)
})
