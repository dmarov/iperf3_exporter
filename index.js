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
        describe: 'target ip or hostname for iperf3',
    })
    .option('time', {
        type: 'int',
        describe: 'iperf3 time option',
        default: 1,
    })
    .demandOption(['t'])
    .argv;

const PORT = argv.port;

const matches = argv.target.match(/(.+)\:(\d+)/);
let TARGET = argv.target;
let TARGET_PORT = 5201;

if (matches !== null) {
    TARGET = matches[1];
    TARGET_PORT = matches[2];
}

const INTERVAL = argv.interval * 1000;
const TIME = argv.time;

const sendGauge = new promClient.Gauge({
    name: 'sent_bits_per_second',
    help: 'sent speed',
    labelNames: ['target'],
});

const receivedGauge = new promClient.Gauge({
    name: 'received_bits_per_second',
    help: 'received speed',
    labelNames: ['target'],
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

    try {

        let data = await spawnPromise(
            'iperf3', ['-i', '0', '-t', TIME, '-c', TARGET, '-p', TARGET_PORT, '--json']
        );
        let jsonData = JSON.parse(data.stdout);

        // console.log(jsonData);

        sendGauge.set({
            target: TARGET,
        }, jsonData.end.sum_sent.bits_per_second);

        receivedGauge.set({
            target: TARGET,
        }, jsonData.end.sum_received.bits_per_second);

    } catch (error) {

        // console.error(error);

        sendGauge.set({
            target: TARGET,
        }, 0);

        receivedGauge.set({
            target: TARGET,
        }, 0);

    }

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
