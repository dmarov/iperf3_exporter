#!/usr/bin/env node

'use strict';

const yargs = require('yargs');
const promClient = require('prom-client');
const register = promClient.register;
const Koa = require('koa');
const Router = require('koa-better-router');
const { spawn } = require('child_process');

const argv = yargs
    .option('p', {
        alias: 'port',
        describe: 'port to bind',
        type: 'int',
        default: 5252,
    })
    .option('i', {
        alias: 'interval',
        describe: 'metrics collection interval(seconds)',
        type: 'int',
        default: 10,
    })
    .option('t', {
        alias: 'target',
        type: 'string',
        describe: 'target ip for iperf3',
    })
    .demandOption(['t'])
    .argv;

const PORT = argv.port;
const TARGET_IP = argv.target;
const INTERVAL = argv.interval * 1000;

const sendGauge = new promClient.Gauge({
    name: 'send_bits_per_second',
    help: 'send speed',
    labelNames: ['target_ip'],
});

const receivedGauge = new promClient.Gauge({
    name: 'received_bits_per_second',
    help: 'received speed',
    labelNames: ['target_ip'],
});


function spawnPromise(...args) {

    return new Promise((res, rej) => {

        let child = spawn(...args);
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {

            stdout += data;

        });

        child.stderr.on('data', (data) => {

            stderr += data;

        });

        child.on('close', (code) => {

            if (code === 0) res({stdout, stderr, code});
            else rej({stdout, stderr, code});

        });

    });

}

setInterval(async _ => {

    let data = await spawnPromise('iperf3', ['-i', '0', '-t', '1', '-c', TARGET_IP, '--json']);
    let jsonData = JSON.parse(data.stdout);

    console.log(jsonData);

    sendGauge.set({
        target_ip: TARGET_IP,
    }, jsonData.end.sum_sent.bits_per_second);

    receivedGauge.set({
        target_ip: TARGET_IP,
    }, jsonData.end.sum_received.bits_per_second);

}, INTERVAL);

const app = new Koa();
const router = new Router();

router.loadMethods();

router.get('/metrics', (ctx, next) => {

    ctx.set('Content-Type', register.contentType);
    ctx.body = register.metrics();
    ctx.status = 200;

})

app.use(router.middleware());

app.listen(PORT, _ => {

    console.log(`listen port ${PORT}`);

});
