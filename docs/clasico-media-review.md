# El Clásico media review

- Dailymotion's official Web SDK needs a Player ID created in the site's own Dailymotion Studio. Set VITE_DAILYMOTION_PLAYER_ID to that ID at build time. No account keys belong in Git.
- scripts/clasico-media-candidates.json is a review queue, not a list of approved videos. Some public uploads may not be authorized; discard them unless rights and embedding are clear.
- Run node scripts/screen-clasico-media.mjs to check public oEmbed metadata. A positive response is not proof of playback or permission.
- Review the footage, confirm the question and exact 17-second interval, confirm rights, and test from the actual published game origin with sound. Only then set videoUrl (with start and end), videoRightsNote, and videoPlaybackVerified in server/elClasico.json. Local licensed clips can instead be imported with the existing import script.
- Unapproved sources never activate. When an approved source fails, the question remains answerable in text. Autoplay and ads are governed by browser and provider; the integration does not bypass them.
- Official documentation: https://developers.dailymotion.com/docs/player-library-script and https://developers.dailymotion.com/reference/web-sdk-player-events
