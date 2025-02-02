/*
 * File: handleSteamIdResolving.js
 * Project: steam-comment-service-bot
 * Created Date: 09.03.2022 12:58:17
 * Author: 3urobeat
 *
 * Last Modified: 16.10.2022 12:28:39
 * Modified By: 3urobeat
 *
 * Copyright (c) 2022 3urobeat <https://github.com/HerrEurobeat>
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
 */


const SteamID         = require("steamid");
const steamIDResolver = require("steamid-resolver");


/**
 * Handles converting profile/group URLs to steamIDs
 * @param {String} str The profileID argument provided by the user
 * @param {SteamID.Type} profileIDType The type of SteamID expected for profileID parameter (https://github.com/DoctorMcKay/node-steamid#types) or null if type should be assumed by checking SteamID(str).type
 * @param {function} [callback] Called with `err` (String or null) and `steamID64` (String or null) parameters on completion
 */
module.exports.run = (str, profileIDType, callback) => {

    // Instantly callback nothing if nothing was provided
    if (!str) return callback(null, null);

    // Function to handle all steamIDResolver callbacks as they are always roughly the same
    function handleResponse(err, res) { //eslint-disable-line
        logger("debug", `handleSteamIdResolving: handleResponse(): Received callback from steamid-resolver. err: ${err} | res: ${res}`);

        if (err) {
            callback(err, null);
        } else {
            // Quickly check if the response has the expected type
            if (profileIDType && new SteamID(res).type != profileIDType) callback(`Received steamID of type ${new SteamID(res).type} but expected ${profileIDType}.`, null);
                else callback(null, res);
        }
    }

    // Try to figure out if user provided an steamID64 or a customURL or a whole profile link
    if (isNaN(str) || !new SteamID(str).isValid()) {
        if (str.includes("steamcommunity.com/id/")) {
            logger("debug", "handleSteamIdResolving: User provided customURL profile link as profileID argument...");

            steamIDResolver.customUrlTosteamID64(str, handleResponse);

        } else if (str.includes("steamcommunity.com/profiles/")) {
            logger("debug", "handleSteamIdResolving: User provided steamID64 profile link as profileID argument...");

            // My library doesn't have a check if exists function nor returns the steamID64 if I pass it into steamID64ToCustomUrl(). But since I don't want to parse the URL myself here I'm just gonna request the full obj and cut the id out of it
            steamIDResolver.steamID64ToFullInfo(str, (err, obj) => handleResponse(err, obj.steamID64[0]));

        } else if (str.includes("steamcommunity.com/groups/")) {
            logger("debug", "handleSteamIdResolving: User provided group link as profileID argument...");

            steamIDResolver.groupUrlToGroupID64(str, handleResponse);

        } else { // Doesn't seem to be an URL

            // If user just provided the customURL part of the URL then try and figure out from the expected profileIDType if this could be a profile or group customURL
            if (profileIDType == SteamID.Type.INDIVIDUAL) {
                logger("debug", "handleSteamIdResolving: User didn't provide a full url as profileID str. Expecting custom profile URL based on profileIDType...");

                steamIDResolver.customUrlTosteamID64(str, handleResponse);

            } else if (profileIDType == SteamID.Type.CLAN) {
                logger("debug", "handleSteamIdResolving: User didn't provide a full url as profileID str. Expecting custom group URL based on profileIDType...");

                steamIDResolver.groupUrlToGroupID64(str, handleResponse);

            } else {

                // ProfileIDType is null, we need to try and figure out what might have been provided
                logger("debug", "handleSteamIdResolving: profileIDType is null. Trying to figure out what has been provided...");

                steamIDResolver.customUrlTosteamID64(str, (err, steamID64) => { // Check profile first, as it will probably be used more often
                    if (err) {
                        logger("debug", "handleSteamIdResolving: profile id check returned an error. Trying group id check...");

                        steamIDResolver.groupUrlToGroupID64(str, (err, groupID) => {
                            if (err) {
                                logger("debug", "handleSteamIdResolving: group id check also returned an error! Sending error message and aborting as user provided something as profileID argument which I don't understand: " + str);
                                handleResponse("ID parameter seems to be invalid.", null);

                            } else {
                                logger("debug", "handleSteamIdResolving: the provided id seems to be a group id! Returning groupID...");
                                handleResponse(null, groupID);
                            }
                        });

                    } else {
                        logger("debug", "handleSteamIdResolving: the provided id seems to be a profile id! Returning steamID64...");
                        handleResponse(null, steamID64);
                    }
                });
            }
        }

    } else {
        logger("debug", "handleSteamIdResolving: I don't need to convert anything as user seems to have already provided an steamID64. Cool!");

        if (profileIDType && new SteamID(str).type != profileIDType) handleResponse(`Received steamID of type ${new SteamID(str).type} but expected ${profileIDType}.`, null);
            else handleResponse(null, str);
    }

};