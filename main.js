"use strict";
const utils = require('@iobroker/adapter-core');
let async = require('async');
let net = require('net');
let benq_commands = require(__dirname + '/admin/commands.json'),
    COMMANDS = benq_commands.models,
    COMMAND_MAPPINGS = benq_commands.command_mapping;
let adapter, connection = false, benq, query_power, rct, buffer = '', permis = false, permis_get_cmd = false, states = {}, old_states = {}, pollcmd = 'vol=?', polling_time = 10000;

function startAdapter(options){
    return adapter = utils.adapter(Object.assign({}, options, {
        systemConfig: true,
        name:         'benq',
        ready:        main,
        unload:       callback => {
            if (benq){
                query_power && clearInterval(query_power);
                rct && clearInterval(rct);
                connection = false;
                _connection(false);
                benq.destroy();
            }
            try {
                adapter.log.debug('cleaned everything up...');
                callback();
            } catch (e) {
                callback();
            }
        },
        stateChange:  (id, state) => {
            if (id && state && !state.ack){
                adapter.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                if (connection){
                    let ids = id.split(".");
                    let command = ids[ids.length - 1].toString();
                    let val = [state.val];
                    if (state.val === false || state.val === 'false'){
                        val = 'off';
                    } else if (state.val === true || state.val === 'true'){
                        val = 'on';
                    }

                    let cmd = COMMAND_MAPPINGS[command];

                    if (cmd){
                        if (cmd === 'pow' && val === 'off'){
                            permis_get_cmd = false;
                            setTimeout(() => {
                                permis_get_cmd = true;
                            }, 120000);

                        } else if (cmd === 'pow' && val === 'on'){
                            permis_get_cmd = false;
                            setTimeout(() => {
                                permis_get_cmd = true;
                            }, 20000);
                        } else {
                            permis_get_cmd = false;
                            permis = false;
                            setTimeout(() => {
                                permis_get_cmd = true;
                                permis = true;
                            }, 5000);
                        }

                        if (states.pow || cmd === 'pow'){
                            if (COMMANDS.hasOwnProperty(cmd) && COMMANDS[cmd].hasOwnProperty('values')){
                                if (COMMANDS[cmd].values.hasOwnProperty(val)){
                                    benq.write('\r*' + cmd + '=' + val + '#\r');
                                    benq.write('*' + cmd + '=' + val + '#\r');
                                    adapter.log.debug('Send Command:*' + cmd + '=' + val + '#');

                                } else {
                                    adapter.log.error('Error value command =*' + cmd + '=' + val + '#');
                                }
                            } else if (COMMANDS.hasOwnProperty(cmd) && !COMMANDS[cmd].hasOwnProperty('values')){
                                benq.write('\r*' + cmd + '#\r');
                                benq.write('*' + cmd + '#\r');
                                adapter.log.debug('Send Command:*' + cmd + '#');
                            }
                        }
                    } else {
                        adapter.log.error('Error command =*' + cmd + '=' + val + '#');
                    }
                }
            }
        }
    }));
}

function main(){
    adapter.subscribeStates('*');
    if (COMMANDS[adapter.config.model_options]){
        COMMANDS = COMMANDS[adapter.config.model_options].commands;
        connect();
    } else {
        adapter.log.error('The selected model was not found in the file.');
    }
}

function connect(cb){
    let msg = '';
    let port = adapter.config.port ? adapter.config.port :23;
    let host = adapter.config.host ? adapter.config.host :'192.168.1.53';
    adapter.log.debug('BenQ ' + adapter.config.model_options + ' connect to: ' + host + ':' + port);
    benq = net.connect(port, host, () => {
        _connection(true);
        query_power && clearInterval(query_power);
        rct && clearInterval(rct);
        permis = true;
        permis_get_cmd = true;
        query_power = setInterval(() => {
            if (permis){
                send(pollcmd);
            }
        }, polling_time);
        //benq.write('\r*error=report#\r');
        //get_commands();
        cb && cb();
    });
    benq.on('data', (chunk) => {
        buffer += chunk.toString();
        //adapter.log.error('Received: ' + message);
        if (buffer.length > 50){
            buffer = '';
            benq.write('\r');
        }
        if (((~buffer.indexOf('\r\n>\u0000\r')) && buffer.length < 6) || ~buffer.indexOf('\r\n>\u0000\r\r\n>\u0000\r\r\n>\u0000')){
            adapter.log.debug('Set to zero. Length:' + buffer.length);
            benq.write('\r');
            buffer = '';
        }
        if (chunk.toString() === '\r'){
            msg = buffer.split('*');
            if (msg){
                for (let i = 0; i < msg.length; i++) {
                    if (msg[i].length > 5 && msg[i].charAt(msg[i].indexOf('=') + 1) !== '?'){
                        msg = msg[i].substring(0, msg[i].indexOf('\r'));
                        msg = msg.replace('#', '');
                    }
                }
            }
            if (~buffer.indexOf('Illegal format')){
                msg = 'Illegal format';
            }
            if (~buffer.indexOf('Unsupported item')){
                msg = 'Unsupported item';
            }
            if (~buffer.indexOf('Block item')){
                msg = 'Block item';
            }
            if (~buffer.indexOf('VOL')){
                msg = 'VOL';
            }
            if ((msg.length > 5 && msg.charAt(msg.indexOf('=') + 1) !== '?') || msg == 'VOL'){
                adapter.log.debug('Received message:' + msg);
                parse_command(msg);
            }
            buffer = '';
        }
    });

    benq.on('error', (err) => {
        adapter.log.error("BenQ: " + err);
        _connection(false);
        if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT"){
            benq.destroy();
        }
    });

    benq.on('close', (e) => {
        if (connection){
            adapter.log.info('BenQ disconnected');
            _connection(false);
        }
        reconnect();
    });
}

function reconnect(t, cb){
    permis = false;
    benq.destroy();
    let time = (t) ? t :30000;
    rct = setTimeout(() => {
        connect();
    }, time);
}

function send(cmd, val){
    if (val === undefined){
        adapter.log.debug('Send Command:*' + cmd + '#');
        benq.write('\r*' + cmd + '#\r');
    } else {
        adapter.log.debug('Send Command:*' + cmd + '=' + val + '#');
        benq.write('\r*' + cmd + '=' + val + '#\r');
    }
}

function parse_command(str){
    let cmd, val;
    if (!~str.indexOf('Unsupported') && !~str.indexOf('Block') && !~str.indexOf('Illegal')){
        cmd = str.split('=')[0];
        val = str.split('=')[1];
        if (str === 'VOL'){
            cmd = 'pow';
            val = 'off';
        }
        if (cmd && val){
            val = val_to_bool(val.replace(/\s/g, '').toLowerCase());
            if (!COMMANDS[cmd]){
                adapter.log.debug('Please send this information to the developer: {' + 'cmd:' + cmd + ', val:' + val + '}');
            } else {
                if (cmd === 'vol' || (cmd === 'pow' && val === 'on')){
                    states.pow = true;
                    if (states.pow !== old_states.pow){
                        old_states.pow = states.pow;
                        adapter.log.info(COMMANDS.pow.name + '{cmd:pow, val:' + states.pow + '}');
                        setObject(COMMANDS.pow.name, true);
                    }
                    get_commands();
                }

                cmd = cmd.toLowerCase();
                states[cmd] = val;
                if (states[cmd] !== old_states[cmd]){
                    old_states[cmd] = states[cmd];
                    adapter.log.info(COMMANDS[cmd].name + '{' + 'cmd:' + cmd + ', val:' + val + '}');
                    setObject(COMMANDS[cmd].name, val);
                }
            }
        }
    }
}

function get_commands(){
    let result = [];
    permis = false;
    setTimeout(() => {
        permis = true;
    }, 60000);
    async.each(Object.keys(COMMANDS), (cmd) => {
        result.push(cmd);
    }, (err) => {
        adapter.log.error('Error async.each');
    });
    result.forEach((cmd, i, arr) => {
        setTimeout(() => {
            if (COMMANDS[cmd] && permis_get_cmd){
                if (COMMANDS[cmd].hasOwnProperty('values')){
                    adapter.log.debug('send_command ' + COMMANDS[cmd].name);
                    if (cmd !== 'pow'){
                        send(cmd, '?');
                    }
                } else {
                    setObject(COMMANDS[cmd].name, false);
                }
            }
        }, i * 5000);
    });
}

function setObject(name, val){
    let type = 'string';
    let role = 'media';
    adapter.log.debug('name:' + name);
    let odj_cmd = COMMANDS[COMMAND_MAPPINGS[name]];
    adapter.log.debug('odj_cmd:' + JSON.stringify(odj_cmd));
    adapter.getObject(name, (err, state) => {
        if (odj_cmd){
            if ((err || !state) && odj_cmd.hasOwnProperty('description')){
                if (odj_cmd.hasOwnProperty('values')){
                    if (odj_cmd.values.hasOwnProperty('on') || odj_cmd.values.hasOwnProperty('off')){
                        type = 'boolean';
                    } else if (odj_cmd.values.hasOwnProperty('?')){
                        role = 'indicator';
                    }
                } else {
                    role = 'button';
                }
                adapter.setObject(name, {
                    type:   'state',
                    common: {
                        name: odj_cmd.description,
                        desc: odj_cmd.description,
                        type: type,
                        role: role
                    },
                    native: {}
                });
                adapter.setState(name, {val: val, ack: true});
            } else {
                adapter.setState(name, {val: val, ack: true});
            }
        }
    });
    adapter.subscribeStates('*');
}


function _connection(state){
    if (state){
        connection = true;
        adapter.log.info('BenQ Connected.');
        adapter.setState('info.connection', true, true);
    } else {
        connection = false;
        adapter.setState('info.connection', false, true);
        old_states = {};
    }
}

function val_to_bool(val){
    if (val === 'on'){
        val = true;
    } else if (val === 'off'){
        val = false;
    }
    return val;
}

if (module.parent){
    module.exports = startAdapter;
} else {
    startAdapter();
}