/*
 * File: bot.js
 * Project: steam-comment-service-bot
 * Created Date: 09.07.2021 16:26:00
 * Author: 3urobeat
 *
 * Last Modified: 16.10.2022 13:04:13
 * Modified By: 3urobeat
 *
 * Copyright (c) 2021 3urobeat <https://github.com/HerrEurobeat>
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
 */



/**
 * Starts & Controls a bot account
 * @param {Object} logOnOptions The steam-user logOnOptions object
 * @param {Number} loginindex The index of this account in the logininfo object
 */
module.exports.run = (logOnOptions, loginindex) => {
    var SteamUser       = require("steam-user");
    var SteamCommunity  = require("steamcommunity");
    var request         = require("request"); // Yes I know, the library is deprecated but steamcommunity uses it as well so it is being used anyway

    var login           = require("../controller/login.js");
    var mainfile        = require("./main.js");


    // Define the log message prefix of this account in order to
    if (loginindex == 0) var thisbot = "Main";
        else var thisbot = `Bot ${loginindex}`;


    // Get proxy of this bot account
    if (login.proxyShift >= login.proxies.length) login.proxyShift = 0; // Reset proxy counter if we used all proxies to start over again

    var thisproxy = login.proxies[login.proxyShift]; // Define the proxy that will be used for this account

    if (!login.additionalaccinfo[loginindex]) login.additionalaccinfo[loginindex] = {};
    login.additionalaccinfo[loginindex].thisproxyindex = login.proxyShift; // Add the proxyindex that is used for this account to the additionalaccinfo obj
    login.additionalaccinfo[loginindex].thisproxy = thisproxy;             // Add this proxy to the additionalaccinfo obj

    login.proxyShift++; // Switch to next proxy

    logger("debug", `[${thisbot}] Using proxy ${login.proxyShift} "${thisproxy}" to log in to Steam and SteamCommunity...`);

    // Create bot & community instance
    const bot       = new SteamUser({ autoRelogin: false, httpProxy: thisproxy, protocol: SteamUser.EConnectionProtocol.WebSocket }); // Forcing protocol for now: https://dev.doctormckay.com/topic/4187-disconnect-due-to-encryption-error-causes-relog-to-break-error-already-logged-on/?do=findComment&comment=10917
    const community = new SteamCommunity({ request: request.defaults({ "proxy": thisproxy }) }); // Pass proxy to community library as well


    // Attach debug log events if enabled in advancedconfig
    if (advancedconfig.steamUserDebug) {
        bot.on("debug", (msg) => {
            logger("debug", `[${thisbot}] steam-user debug: ${msg}`);
        });
    }

    if (advancedconfig.steamUserDebugVerbose) {
        bot.on("debug-verbose", (msg) => {
            logger("debug", `[${thisbot}] steam-user debug-verbose: ${msg}`);
        });
    }


    // Run main.js if this is bot0
    if (loginindex == 0) mainfile.run();


    /* ------------ Login: ------------ */
    login.additionalaccinfo[loginindex].logOnTries = 0;
    if(global.checkm8!="b754jfJNgZWGnzogvl<rsHGTR4e368essegs9<")process.send("stop()"); // eslint-disable-line

    // Log in with this account when the previous account is done logging in
    module.exports.logOnAccount = () => { // Make it a function in order to be able to retry a login from error.js
        var loggedininterval = setInterval(async () => { // Set an interval to check if previous acc is logged on

            if (login.accisloggedin || login.additionalaccinfo[loginindex].logOnTries > 0) { // Start attempt if previous account is logged on or if this call is a retry
                clearInterval(loggedininterval); // Stop interval

                login.accisloggedin = false; // Set to false again so the next account waits for us to log in

                // Count this attempt
                login.additionalaccinfo[loginindex].logOnTries++;

                // Log login message for this account, with mentioning proxies or without
                if (!thisproxy) logger("info", `[${thisbot}] Trying to log in without proxy... (Attempt ${login.additionalaccinfo[loginindex].logOnTries}/${advancedconfig.maxLogOnRetries + 1})`, false, true, logger.animation("loading"));
                    else logger("info", `[${thisbot}] Trying to log in with proxy ${login.proxyShift - 1}... (Attempt ${login.additionalaccinfo[loginindex].logOnTries}/${advancedconfig.maxLogOnRetries + 1})`, false, true, logger.animation("loading"));

                // Call our steam-session helper to get a valid refresh token for us
                let sessionHandler = require("../sessions/sessionHandler.js");
                let session = new sessionHandler(bot, thisbot, loginindex, logOnOptions);

                let refreshToken = await session.getToken();
                if (!refreshToken) return; // Stop execution if getRefreshToken aborted login attempt, it either skipped this account or stopped the bot itself

                // Login with this account using the refreshToken we just obtained using steam-session
                bot.logOn({ "refreshToken": refreshToken });
            }
        }, 250);
    };

    this.logOnAccount(); // Login now


    /* ------------ Events: ------------ */
    bot.on("error", (err) => { // Handle errors that were caused during logOn
        require("./events/error.js").run(err, loginindex, thisbot, thisproxy, logOnOptions, bot);
    });

    bot.on("loggedOn", () => { // This account is now logged on
        require("./events/loggedOn.js").run(loginindex, thisbot, bot, community);
    });

    bot.on("webSession", (sessionID, cookies) => { // Get websession (log in to chat)
        require("./events/webSession.js").run(loginindex, thisbot, bot, community, cookies);
    });

    // Accept Friend & Group requests/invites
    bot.on("friendRelationship", (steamID, relationship) => {
        require("./events/relationship.js").friendRelationship(loginindex, thisbot, bot, steamID, relationship);
    });

    bot.on("groupRelationship", (steamID, relationship) => {
        require("./events/relationship.js").groupRelationship(thisbot, bot, steamID, relationship);
    });


    /* ------------ Message interactions: ------------ */
    bot.on("friendMessage", function(steamID, message) {
        require("./events/friendMessage.js").run(loginindex, thisbot, bot, community, steamID, message);
    });

    // Display message when connection was lost to Steam
    bot.on("disconnected", (eresult, msg) => {
        require("./events/disconnected.js").run(loginindex, thisbot, logOnOptions, bot, thisproxy, msg);
    });

    // Get new websession as sometimes the bot would relog after a lost connection but wouldn't get a websession. Read more about cookies & expiration: https://dev.doctormckay.com/topic/365-cookies/
    var lastWebSessionRefresh = Date.now(); // Track when the last refresh was to avoid spamming webLogOn() on sessionExpired

    community.on("sessionExpired", () => {
        if (Date.now() - lastWebSessionRefresh < 15000) return; // Last refresh was 15 seconds ago so ignore this call

        logger("info", `[${thisbot}] Session seems to be expired. Trying to get new websession...`);
        lastWebSessionRefresh = Date.now(); // Update time
        bot.webLogOn();
    });
};

// Code by: https://github.com/HerrEurobeat/