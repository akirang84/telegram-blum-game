clear();
(async () => {
    const baseUrl = 'https://game-domain.blum.codes/api/v1';
    let retryCount = 0;
    let maxRetryCount = 5;
    let playPasses = 0;
    async function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async function handle503Error(resp, fnc) {
        if (resp.status === 503) {
            console.info('Service unavailable, retrying in 3 seconds...');
            await sleep(3000);
            return fnc.call();
        }
    }
    async function getBalance(headers) {
        let balance = 0;

        try{
            const resp = await fetch(`${baseUrl}/user/balance`, {
                method: 'GET',
                headers: headers,
            });

            const respData = await resp.json();

            if (resp.status === 401) {
                console.info(respData.message);
                return -401;
            }

            // Blum has many requests so sometime server will respond as 503 error code. Wait and re-try
            await handle503Error(resp, async () => await getBalance(headers))

            balance = respData?.availableBalance;
            playPasses = respData?.playPasses;
        }
        catch (ex) {
            console.warn('Cannot get balance');
            console.error(ex);
        }

        return balance;
    }
    async function playGame(headers) {
        try
        {
            delete headers["content-type"];
            const resp = await fetch(`${baseUrl}/game/play`, {
                method: 'POST',
                headers: headers,
            });

            const respData = await resp.json();

            if (resp.status === 401) {
                console.info(respData.message);
                return -401;
            }

            if (resp.status === 400 && respData.message === 'cannot start game' && retryCount < maxRetryCount) {
                console.info(`Cannot start the game, will retry in 5 seconds. Retry: ${retryCount+1}/${maxRetryCount}`);
                await sleep(5000);
                return await playGame(headers);
            }

            // Blum has many requests so sometime server will respond as 503 error code. Wait and re-try
            await handle503Error(resp, async () => await playGame(headers))

            return respData?.gameId;
        }
        catch (e) {
            console.warn(e);
        }

    }
    async function claim(headers, gameId, points) {
        try{
            headers["content-type"] = 'application/json'
            delete headers["content-length"]
            const resp = await fetch(`${baseUrl}/game/claim`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    'gameId': gameId,
                    'points': points
                })
            });

            if (resp.status === 200) {
                return await resp.text();
            }

            const respData = await resp.json();

            if (resp.status === 401) {
                console.info(respData.message);
                return -401;
            }

            await handle503Error(resp, async () => await claim(headers, gameId, points))
        }
        catch (e) {
            console.warn(e);
        }

    }
    async function playAndClaimGame(accessToken) {
        let contPlayGame = true;
        let gameCounter = 1;

        const headers =  {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'authorization': accessToken,
            'content-length': '0',
            'origin': 'https://telegram.blum.codes',
            'priority': 'u=1, i',
            'sec-ch-ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Microsoft Edge";v="128", "Microsoft Edge WebView2";v="128"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0'
        }

        await getBalance(headers);

        while (contPlayGame) {
            retryCount = 0;

            if (playPasses <= 0) {
                console.info('No play passes left');
                contPlayGame = false;
                break;
            }

            console.info(`- ${gameCounter}. Play game..`)

            console.info(` - ${gameCounter}. Start Play game..`)
            const _points = Math.floor(
                Math.random() * (500 - 250) + 250
            );

            // get balance before play game
            let oldBalance = await getBalance(headers);

            if (oldBalance === -401) {
                console.warn(`Access token is expired or invalid. UPDATE access token and re-run script.`);
                break;
            }

            const gameId = await playGame(headers);

            if (gameId === -400) {
                console.warn(`Cannot play game due to out of ticks. Invite more to get more tickets`);
                break;
            }

            console.info(` - GameId: ${gameId}. Balance: ${oldBalance}`)

            if (gameId) {
                const gamePlayingTime = Math.floor(Math.random() * 11 + 150) * 1000
                console.info(` - Play the game in ${gamePlayingTime/1000} seconds`)
                await sleep(gamePlayingTime)

                // claim the game points after play game, retry after 5 seconds if exception was thrown during claim point
                const claimText = await claim(headers, gameId, _points);

                const newBalance = await getBalance(headers);
                console.info(` - Claim Status: ${claimText}. Game Points: ${newBalance - oldBalance}. New balance: ${newBalance}. `)

                // relax before go to next game
                const restTime = Math.floor(Math.random() * 6 + 5) * 1000
                await sleep(restTime);

                gameCounter++;
            }
            else {
                console.warn(" - Cannot connect to start the game, ignore, wait 3s and try again");
                await sleep(3000);
            }
        }

        console.info(" - [ DONE ALL ] ")
    }

    const accessToken = 'Bearer xxxxxxx';
    await playAndClaimGame(accessToken);
})()
