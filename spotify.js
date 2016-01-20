var Promise     = require('bluebird');
var fs          = Promise.promisifyAll(require('fs'));

var util        = require('util');
var http        = require('http');
var levenshtein = require('fast-levenshtein');
var PlayMusic   = require('playmusic');
var colors      = require('colors');
var querystring = require('querystring');
var yargs       = require('yargs').argv;

var SPOTIFY     = "ws.spotify.com";
var SPOTIFY_URL = "/lookup/1/.json?uri=";

var errorlog    = [];

//
// Prototype extension for PlayMusic to delete a Playlist
//
PlayMusic.prototype.deletePlaylist = function (playlistId, callback) {
    var that = this;
    var mutations = [
    {
        "delete" : playlistId
    }
    ];
    this.request({
        method: "POST",
        contentType: "application/json",
        url: this._baseURL + 'playlistbatch?' + querystring.stringify({alt: "json"}),
        data: JSON.stringify({"mutations": mutations})
    }, function(err, body) {
        callback(err ? new Error("error deleting playlist " + err) : null, body);
    });
};

//
// Promise after added method
//
var pm = Promise.promisifyAll(new PlayMusic());

if (!yargs.file || !yargs.playlist || !yargs.email || !yargs.playlist) {
    return console.error('Usage: spotify.js --file=csv --playlist=name --email=email --password=password [--concurrency=10]');
}


//
// config
//
var config = {email: yargs.email, password: yargs.password, concurrency: 30};

if (yargs.concurrency) {
    config.concurrency = yargs.concurrency;
}

var prequest = Promise.method(function(options, maxRetries) {
    if (typeof maxRetries === 'undefined') {
        maxRetries = 0;
    }
    return new Promise(function(resolve, reject) {
        var request = http.get(options, function(response) {
            // Bundle the result
            var result = {
                'httpVersion': response.httpVersion,
                'httpStatusCode': response.statusCode,
                'headers': response.headers,
                'body': '',
                'trailers': response.trailers,
            };

            // Build the body
            response.on('data', function(chunk) {
                result.body += chunk;
            });

            response.on('end', () => { resolve(result); });
        }).on('error', function(error) {
            if (maxRetries <= 0) {
                console.log('Problem with request:', error.message);
                reject(error);
            } else {
                console.log('Retrying %s'.red, options.path);
                return prequest(options, maxRetries - 1);
            }
        });
    });
});


//
// accepts json response from call to getPlayLists. Filters by name
//
var deletePlaylist = function(gmusicPlaylists, filter) {
    if (!gmusicPlaylists || !gmusicPlaylists.data || !gmusicPlaylists.data.items) {
        return;
    }

    gmusicPlaylists.data.items.filter((a) => { return a.name == filter }).forEach((val) => {
        console.log('Deleting playlist: %s'.yellow, filter);
        return pm.deletePlaylistAsync(val.id).done();
    });
};

//
// gets spotify line and requests track information from spotify web service. continues the chain
// by getting matching song from Google Play Music and adding closest match to Playlist
//
var getTrackListing = function(line) {
    //
    // translate web spotify track to web service
    //
    line = line.replace('https://open.spotify.com/track/', 'spotify:track:');

    var options = {
        hostname: SPOTIFY,
        path: SPOTIFY_URL + line,
        headers: {
            'Connection': 'keep-alive'
        }
    };

    return prequest(options, 3)
        .then((data) => {
            try {
                var listing = JSON.parse(data.body);
            } catch (e) {
                console.log(data);
                throw e;
            }
            return info = { artist: listing.track.artists[0].name, album: listing.track.album.name, track: listing.track.name, spotify: line };
        })
        .then((song) => {
            return getBestMatch(song);
        })
        .then((match) => {
            if (match && match.track) {
                console.log('Adding: %s - %s - %s to Playlist %s'.green, match.track.artist, match.track.album, match.track.title, yargs.playlist);
                return pm.addTrackToPlayListAsync(match.track.nid, config.playlistId);
            } else {
                console.log('Song not found: %s - %s - %s'.red, match.song.artist, match.song.album, match.song.track);
                errorlog.push(util.format('Song not found: %s - %s - %s'.red, match.song.artist, match.song.album, match.song.track));
                return;
            }
        })
        .catch((e) => {
            console.log('Error requesting Spotify track info: %s'.red, e);
        });
}

var lv = Promise.promisify(levenshtein.get);

var getBestMatch = function(listing) {
    //
    // sanitize track names for better matching
    //
    listing.track = listing.track.replace(/-/g, ' ');
    listing.track = listing.track.replace(/remastered/i, '');
    listing.track = listing.track.replace(/\(\s?[0-9]{4}\)/, '');

    return pm.searchAsync(listing.artist + ' ' + listing.track, 10)
        .then((x) => {
            if (!x || !x.entries) return {song: listing};

            var match = x.entries.filter((entry) => entry.type == '1')
                .sort((a, b) => lv(listing.artist, a.track.artist) - lv(listing.artist, b.track.artist))
                .sort((a, b) => lv(listing.track, a.track.title) - lv(listing.track, b.track.title))
                .sort((a, b) => {
                    var alive = a.track.album.search(/live/i);
                    var blive = b.track.album.search(/live/i);

                    if (alive == -1 && blive >= 0) {
                        return -1
                    }
                    if (alive >= 0 && blive == -1) {
                        return 1;
                    }

                    return 0;
                })
                .shift();

            if (!match) {
                match = {};
            }

            match.song = listing;

            return match;
        });
}

//
// begin chain. See README for instructions
//
pm.loginAsync(config)
    .then((login) => {
        config.masterToken = login.masterToken;
        return pm.initAsync(config);
    })
    .then(() => {
        return pm.getPlayListsAsync();
    })
    .then((response) => {
        return deletePlaylist(response, yargs.playlist);
    })
    .then(() => {
        return pm.addPlayListAsync(yargs.playlist);
    })
    .then((re) => {
        config.playlistId = re.mutate_response[0].id;
        return fs.readFileAsync(yargs.file);
    })
    .then((data) => {
        return data.toString().trim(/\r\n|\n/).split(/\n|\r\n/).filter((x) => x != undefined);
    })
    .map(getTrackListing, {concurrency: config.concurrency})
    .then(() => {
        errorlog.forEach((x) => {
            console.log(colors.red(x));
        })
    })
    .catch((err) => {
        return console.error(err);
    })
    .done();
