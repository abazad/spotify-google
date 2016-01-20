This script allows you to move Spotify playlists over to Google Play Music in a fast method with best matching. Songs not matched/found are printed out at the end.

To use, you MUST have configured Google to create an Android device on your account. There are 2 options
    1. Login to your Google account from an Android device and play a song.
    2. Download BlueStacks for Windows. Login to your Google account, Open Google Play Music and play a song.

Keyword is you have to play a song from an 'Android' device to get this to work. With Bluestacks you don't actually have to own an android device.

Select a list of songs in Spotify and right-click and Copy Spotify URI.
Use notepad or a text editor and save the list. Your file should look like:
    spotify:track:4SprfEpYgNl8lmMeT3Rwhi
    spotify:track:3SSWtSC4IBv2uOAjCViPSU
    spotify:track:0e7rlGtL5EMQkxn2rVl2Nl
    spotify:track:7m6uyBC8LnIL8M3ceDHqM1
    spotify:track:3kI8fSpOQmL5ax63lBOuH3
    spotify:track:7CYIGdHT212sNhyLjveUnC


Usage: node spotify.js --file=Spotify-MyMusic.txt --playlist=Spotify --email=youremail@gmail.com --password=password [--concurrency=30]

--file=     name of the file you created in the step above.
--playlist= name of the playlist to create in Google Music. NOTE: if any playlist by the same name exists it will be deleted
--email=    your google account email
--password= your google account password

A list of songs that did not match will be printed out in red at the end. You can manually find these, or modify the script to filter or find a better match in general.
