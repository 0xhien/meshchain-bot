import fetch from 'node-fetch';
import {
    SocksProxyAgent
} from 'socks-proxy-agent';
import {
    logger
} from './logger.js';

async function coday(url, method, headers, payloadData = null, proxy) {
    try {
        // logger(`proxy: ${proxy}`, 'info');
        const options = {
            method,
            headers,
        };
        if (payloadData) {
            options.body = JSON.stringify(payloadData);
        }
        if (proxy) {
            // Ensure the proxy URL starts with "socks5://"
            const proxyUrl = proxy.startsWith('socks5://') ? proxy : `socks5://${proxy}`;
            options.agent = new SocksProxyAgent(proxyUrl);
            logger(`使用代理: ${proxyUrl}`, 'info');
        } else {
            throw new Error("必须提供代理");
        }
        const response = await fetch(url, options);
        const jsonData = await response.json().catch(() => ({}));

        if (!response.ok) {
            return {
                error: true,
                status: response.status,
                data: jsonData
            };
        }
        return jsonData;
    } catch (error) {
        logger(`Error in coday: ${error.message}`, 'error');
        return {
            error: true,
            message: error.message
        };
    }
}

// Main Logic for estimating, claiming, and starting rewards
async function estimate(id, headers, proxy) {
    const url = 'https://api.meshchain.ai/meshmain/rewards/estimate';
    const result = await coday(url, 'POST', headers, {
        unique_id: id
    }, proxy);
    if (result.status === 400) {
        logger("Mine Not Start, Starting Mine...");
        await start(id, headers, proxy);
    }

    return result || undefined;
}

async function claim(id, headers, proxy) {
    const url = 'https://api.meshchain.ai/meshmain/rewards/claim';
    const result = await coday(url, 'POST', headers, {
        unique_id: id
    }, proxy);

    return result.total_reward || null;
}

async function start(id, headers, proxy) {
    const url = 'https://api.meshchain.ai/meshmain/rewards/start';
    const result = await coday(url, 'POST', headers, {
        unique_id: id
    }, proxy);

    return result || null;
}

async function info(id, headers, proxy) {
    const url = 'https://api.meshchain.ai/meshmain/nodes/status';
    const result = await coday(url, 'POST', headers, {
        unique_id: id
    }, proxy);

    return result || null;
}

export {
    coday,
    estimate,
    claim,
    start,
    info
};