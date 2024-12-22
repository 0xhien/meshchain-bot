import {
    coday,
    start,
    estimate,
    claim,
    info
} from './scripts.js';
import readline from 'readline/promises';
import fs from 'fs/promises';
import crypto from 'crypto';
import {
    SocksProxyAgent
} from 'socks-proxy-agent';
import {
    logger
} from './logger.js';
import {
    banner
} from './banner.js';
import {
    solveAntiCaptcha,
    solve2Captcha
} from './utils/solver.js';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

let headers = {
    'Content-Type': 'application/json',
};

// Register Function
async function register(name, email, password, apiKey, proxy) {
    const payloadReg = {
        captcha_token: await solve2Captcha(apiKey),
        full_name: name,
        email: email,
        password: password,
        referral_code: "", // 邀请码
    };

    // const agent = new SocksProxyAgent(proxy);
    const response = await coday(
        'https://api.meshchain.ai/meshmain/auth/email-signup',
        'POST',
        headers,
        payloadReg,
        proxy
    );
    return response.message || "没有返回消息";
}

// Login Function
async function login(email, password, apiKey, proxy) {
    const payloadLogin = {
        captcha_token: await solve2Captcha(apiKey),
        email: email,
        password: password,
    };

    const agent = new SocksProxyAgent(proxy);
    const response = await coday(
        'https://api.meshchain.ai/meshmain/auth/email-signin',
        'POST',
        headers,
        payloadLogin,
        proxy
    );

    if (response.access_token) {
        logger('登录成功！', "success");
        return response;
    }
    logger('登录失败。请检查您的凭据。', "error");
    return null;
}

// Verify Email Function
async function verify(email, apiKey, proxy) {
    console.log(`正在验证邮箱: ${email}`);
    const otp = await rl.question("请输入邮箱中的验证码: ");

    const payloadVerify = {
        captcha_token: await solve2Captcha(apiKey),
        email: email,
        code: otp,
    };

    const agent = new SocksProxyAgent(proxy);
    const response = await coday(
        'https://api.meshchain.ai/meshmain/auth/verify-email',
        'POST',
        headers,
        payloadVerify,
        proxy
    );
    return response.message || "验证失败";
}

// Claim BNB Reward Function
async function claimBnb(proxy) {
    const payloadClaim = {
        mission_id: "EMAIL_VERIFICATION"
    };

    const agent = new SocksProxyAgent(proxy);
    const response = await coday(
        'https://api.meshchain.ai/meshmain/mission/claim',
        'POST',
        headers,
        payloadClaim,
        proxy
    );
    return response.status || "领取失败";
}

// Generate a 16-byte hexadecimal string
function generateHex() {
    return crypto.randomBytes(16).toString('hex');
}

// Initialize Node and Save Unique ID
async function init(randomHex, proxy) {
    const url = "https://api.meshchain.ai/meshmain/nodes/link";
    const payload = {
        "unique_id": randomHex,
        "node_type": "browser",
        "name": "Extension"
    };

    const agent = new SocksProxyAgent(proxy);
    const response = await coday(url, 'POST', headers, payload, proxy);
    if (response.id) {
        try {
            // Append the unique ID to unique_id.txt
            await fs.appendFile('unique_id.txt', `${response.unique_id}\n`, 'utf-8');
            logger(`ID 已保存到 unique_id.txt: ${response.unique_id}`, "success");
        } catch (err) {
            logger('保存唯一 ID 到文件失败:', "error", err.message);
        }
    }
    return response;
}

// Main Function
async function main() {
    try {
        logger(banner, "debug");

        // Prompt user for input sequentially
        const apiKey = ''; //2Captcha API Key 填到这里
        logger(`ApiKey 已输入: ${apiKey}`, "debug");

        // Read accounts and proxies from files
        let accounts;
        try {
            const accountsData = await fs.readFile('accounts.txt', 'utf-8');
            accounts = accountsData.split('\n').filter(Boolean).map(line => {
                const [email, password] = line.replace('\r', '').split(':');
                return {
                    email,
                    password
                };
            });
            logger(`已读取账户信息: ${JSON.stringify(accounts)}`, "debug");
        } catch (err) {
            logger('读取 accounts.txt 文件失败:', "error", err.message);
            return;
        }

        let proxies;
        try {
            const proxiesData = await fs.readFile('proxies.txt', 'utf-8');
            proxies = proxiesData.split('\n').filter(Boolean).map(line => line.replace('\r', ''));
            logger(`已读取代理信息: ${proxies.join(', ')}`, "debug");
        } catch (err) {
            logger('读取 proxies.txt 文件失败:', "error", err.message);
            return;
        }

        for (let i = 0; i < accounts.length; i++) {
            const {
                email,
                password
            } = accounts[i];
            const proxy = proxies[i % proxies.length];

            logger(`正在注册账户: ${email}:${password} 使用代理: ${proxy}`);

            // Register the user
            const registerMessage = await register(email, email, password, apiKey, proxy);
            logger(`注册响应: ${registerMessage}`);

            // Log in the user
            const loginData = await login(email, password, apiKey, proxy);
            if (!loginData) continue;

            // Set headers with access token
            headers = {
                ...headers,
                'Authorization': `Bearer ${loginData.access_token}`,
            };

            // Verify Email
            const verifyMessage = await verify(email, apiKey, proxy);
            logger(`验证响应: ${verifyMessage}`);

            // Claim Reward
            const claimMessage = await claimBnb(proxy);
            logger(`领取 0.01 BNB 成功: ${claimMessage}`, "success");

            // Create and link a unique ID
            const randomHex = generateHex();
            const linkResponse = await init(randomHex, proxy);

            // Save tokens and unique ID
            try {
                // Append tokens to token.txt
                await fs.appendFile(
                    'token.txt',
                    `${loginData.access_token}|${loginData.refresh_token}\n`,
                    'utf-8'
                );
                logger('令牌已保存到 token.txt', "success");

                // Start the node
                const starting = await start(linkResponse.unique_id, headers, proxy);
                if (starting) {
                    logger(`扩展 ID: ${linkResponse.unique_id} 已激活`, "success");
                }

                // Estimate rewards
                const estimateResult = await estimate(linkResponse.unique_id, headers, proxy);
                logger(`奖励估算结果: ${JSON.stringify(estimateResult)}`, "debug");

                // Claim rewards
                const claimResult = await claim(linkResponse.unique_id, headers, proxy);
                logger(`奖励领取结果: ${claimResult}`, "debug");

                // Get node info
                const infoResult = await info(linkResponse.unique_id, headers, proxy);
                logger(`节点信息: ${JSON.stringify(infoResult)}`, "debug");
            } catch (err) {
                logger('保存数据到文件失败:', "error", err.message);
            }

            // Wait for user confirmation to proceed to the next account
            const proceed = await rl.question("按 Enter 键注册下一个账户或输入 'exit' 停止: ");
            if (proceed.toLowerCase() === 'exit') {
                break;
            }
        }
    } catch (error) {
        logger("发生错误:", "error", error.message);
    } finally {
        rl.close();
    }
}

main();