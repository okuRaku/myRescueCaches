const express = require('express');
const fetch = require('node-fetch');
const open = require('open');
const app = express();
const port = 1420;

const ESI_LOGIN_URL = 'https://login.eveonline.com/oauth/authorize?response_type=token&redirect_uri=http://localhost:1420/callback&client_id=bc8f37ae39414e89b23cccd17dbf4ef3&scope=esi-assets.read_assets.v1'

app.use('/callback', express.static('public'));
app.get('/authed', async (req, res) => {
    const verifyResp = await fetch('https://esi.evetech.net/verify/?datasource=tranquility&token=' + req.query.token);
    const authedChar = await verifyResp.json();
    const assets = await getAllAssets(req, authedChar);
    // This will filter all assets down to:
    // Small Secure Containers (type = 3467) anchored in space (AutoFit)
    // with Quantity 1 and location in J-space (loc id 31000000-32000000)
    const containers = assets.filter(asset => {
        return asset.quantity === 1 &&
        asset.type_id === 3467 &&
        asset.location_flag === 'AutoFit' &&
        (asset.location_id >= 31000000 && asset.location_id <= 32000000)
    })

    if(containers && containers.length != 0) {
        const containerItemIds = containers.map(x => x.item_id);
        // pull all contents of containers; location_id will match item_id of container
        const allContents = assets.filter(asset => containerItemIds.includes(asset.location_id))

        // grab some trivia info 
        const funItems = {};
        allContents.forEach(containeredItem => {
            const typeId = containeredItem.type_id;
            // any item not a probe or a launcher is considered fun...
            if(! [17938, 30013].includes(typeId)) {
                if(!funItems[typeId]) {
                    funItems[typeId] = 1;
                } else {
                    funItems[typeId] += 1;
                }
            }
        });

        const mostPopularFunItemId = Object.keys(funItems).reduce((a,b) => funItems[a] > funItems[b] ? a : b);
        const idsToTranslate = [mostPopularFunItemId];
        containers.forEach(x => idsToTranslate.push(x.location_id));

        const namesResp = await fetch('https://esi.evetech.net/latest/universe/names/?datasource=tranquility', { method: 'POST', body: JSON.stringify(idsToTranslate)});
        const translatedIds = await namesResp.json(); 

        let responseMessage = '';
        if(!containerItemIds || containerItemIds.length === 0) {
            responseMessage += 'It seems that you don\'t currently own any caches.<br>';
        } else {
            responseMessage += 'You currently retain ownership of ' + containerItemIds.length + ' caches.<br>'
            responseMessage += 'Most popular fun item: ' + translatedIds.find(x => x.id == mostPopularFunItemId).name + '.<br>';
        }

        // 17938 core probe launcher
        // 30013 core scanner probe

        containerItemIds.forEach(container => {
            const contents = allContents.filter(x => x.location_id == container).map(x => x.type_id);
            if(!contents.includes(17938)) {
                responseMessage += 'A cache you own in ' + translatedIds.find(x => x.id == containers.find(x => x.item_id == container).location_id).name + ' doesn\'t contain Core Probe Launcher I! <br>'
            }
            if(!contents.includes(30013)) {
                responseMessage += 'A cache you own in ' + translatedIds.find(x => x.id == containers.find(x => x.item_id == container).location_id).name + ' doesn\'t contain Core Scanner Probe I!'
            }
        })

        res.send(responseMessage)
    } else {
        res.send('It seems that you don\'t currently own any caches.<br>');
    }
});
    

const server = app.listen(port, () => console.log(`Callback app listening on port ${port}!`))

open(ESI_LOGIN_URL);

function getAllAssets(req, authedChar) {
    return new Promise(resolve => {
    
        fetch('https://esi.evetech.net/latest/characters/'+ authedChar.CharacterID +'/assets/?datasource=tranquility&page=1&token=' + req.query.token).then(resp => {
            resp.json().then(obj => {
                let assets = obj;
                
                // assets come in pages of 1000, this will tell us how many more queries are necessary and do those
                const totalPages = resp.headers.get('X-Pages')
                const promises = [];
                if (totalPages > 1) {
                    for(i = 2; i <= totalPages; i++) {
                        promises.push(fetch('https://esi.evetech.net/latest/characters/1579822228/assets/?datasource=tranquility&page=' + i + '&token=' + req.query.token).then(resp => resp.json()));
                    }
                };
                Promise.all(promises).then(pages => {
                    pages.forEach(page => {
                        assets = assets.concat(page);
                        
                    });
                    console.log('Shutting down callback server');
                    // at this point we shouldn't need the authed endpoint anymore, shutdown callback server
                    server.close();
                    return resolve(assets);
                })
            });
        });
    });
};

