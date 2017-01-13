"use strict"

var WebSocketServer = require('ws').Server
    , fs =  require('fs')
    , url = require('url')
    , http = require('http')
    , express = require('express')
    , nickname = require('./nickname')
    , SHA256 = require("crypto-js/sha256")
    , app = express()
    , connectionIDCounter = 0
    , connections = {}
    , salt = "change me"

fs.readFile('./config.json', 'utf8', (err, data) => {
    err ? console.log(err.message) : salt = JSON.parse(data).salt
})

app.use(express.static(__dirname + '/public'));
app.get('/', function (req, res) {
    res.render('index.html');
});

var server = http.createServer(app);
server.listen(8080);
var wss = new WebSocketServer({server: server})
wss.on('connection', function(ws) {

    ws.id = connectionIDCounter ++
    ws.nickname = nickname.generate()
    ws.room = null
    ws.ip = ws._socket.remoteAddress.match(/(\d+.\d+.\d+.\d+)/)
    connections[ws.id] = ws
    console.log('User with id ' + ws.id + ' has connected to the server')

    ws.on('message', function(message) {
        var event = JSON.parse(message)
            , data = null
            , contributors = null
        switch (event.type) {
            case 'onCreateRoom':
                if (!room.items[ws.room]) {
                    ws.room = room.create({id: ws.id, nickname: ws.nickname}, ws.token)
                    if (ws.room || ws.room === 0) {
                        ws.current = ws.room
                        data = { type: 'onRender', id: ws.id, rooms: room.items }
                        ws.send(JSON.stringify({type: 'onRender', room: room.items[ws.current], history: room.history[id] }))
                    }
                }
                break
            case 'onEnterRoom':
                var id = event.room
                if (id != ws.current && room.items[id]) {
                    if (room.items[id].members.every(
                        (item) => item.id != ws.id
                    )) {
                        room.items[id].members.push({id: ws.id, nickname: ws.nickname})
                    }
                    room.leave(ws.id, ws.current)
                    ws.current = id
                    data = { type: 'onRender', members: room.items[id].members.length, rooms: room.items }
                        , contributors = []
                    room.items[id].members.forEach(item => contributors.push(item.id))
                    ws.send(JSON.stringify({ type: 'onRender', room: room.items[id], history: room.history[id] }))
                }
                break
            case 'onChatRoom':
                var id = ws.current
                let timestamp = Date.now()
                if ((!ws.lastTimestamp || timestamp - ws.lastTimestamp > 1000) && id !== null && room.items[id] && event.message) {
                    ws.lastTimestamp = timestamp
                    var result = room.chat(ws.current, {id: ws.id, nickname: ws.nickname}, event.message)
                    if (result) {
                        data = {type: 'onRender', author: ws.nickname, message: event.message, rooms: room.items}
                            , contributors = []
                        room.items[id].members.forEach(item => contributors.push(item.id))
                    }
                } else if (timestamp - ws.lastTimestamp < 1000) {
                    data = {type: 'onRender', author: ws.nickname, error: true, message: 'Не более 1 сообщения в секунду', rooms: room.items}
                        , contributors = [ws.id]
                }
                break
            case 'onTypeChat':
                var id = ws.current
                data = { type: 'onRender', writing: event.writing, author: ws.nickname }
                    , contributors = []
                room.items[id].members.forEach(item => item.id != ws.id ? contributors.push(item.id) : null)
            case 'onRefreshToken':
                if (event.token && !tokens.isValidToken(event.token) || !event.token) {
                    var token = ""
                    token = SHA256(ws.id + salt) + token
                    tokens.register({token: token, date: new Date(new Date().getTime() + 30 * 60 * 1000)})
                    data = { type: 'onRender', token: token }
                        , contributors = [ ws.id ]
                }
                ws.token = token
                break
            default:
                break
        }
        if (data) wss.broadcast(JSON.stringify(data), contributors)
    });
    ws.on('close', function () {
        delete connections[ws.id]
        var result = room.leave(ws.id, ws.current)
        wss.broadcast(JSON.stringify({
            type: 'onRender',
            count: wss.clients.length,
            rooms: room.items,
        }))
        if (result && result.id && result.members) {
            let ids = []
            result.members.forEach(item => ids.push(item.id))
            if (result.id == 'delete') {
                wss.broadcast(JSON.stringify({
                    type: 'onRender',
                    room: result.id,
                }), ids)
            } else {
                wss.broadcast(JSON.stringify({
                    type: 'onRender',
                    members: result.members.length,
                }), ids)
            }
        }

        console.log('User with id ' + ws.id + ' has left from the server')
    })

    wss.broadcast(JSON.stringify({
        type: 'onRender',
        count: wss.clients.length,
        rooms: room.items,
    }))
    wss.broadcast(JSON.stringify({
        type: 'onRender',
        nickname: ws.nickname,
    }), [ws.id])
});

wss.broadcast = (data, ids) => {
    ids ? wss.clients.forEach(client => ids.some(item => item === client.id ? client.send(data) : null))
        : wss.clients.forEach(client => client.send(data))
}

var room = {
    create: function(owner, token) {
        var id = 0

        let isNotCreateable = Object.entries(this.items).some(item => item instanceof Object && item.token == token)
        if (isNotCreateable) return null

        while(this.items[id]) id ++
        this.items[id] = { id: id, owner: owner, members: [owner], token: token }
        this.history[id] = []
        return id
    },
    leave: function(member, id) {
        if (id === null || !this.items[id]) return
        var members = this.items[id].members
        if (member == this.items[id].owner.id) {
            delete this.items[id], delete this.history[id]
            return {members: members, id: 'delete'}
        } else {
            members.some( (item, i, arr) => member === item.id ? arr.splice(i, 1) : null )
            if (members.length) {
                this.items[id].members = members
            } else {
                members = null
                delete this.items[id], delete this.history[id]
            }
            return {members: members, id: id}
        }
    },
    chat: function (id, author, text) {
        text = text.trim()
        if (!text || text === null) return false
        if (text.length < 256) {
            let message = { author: author.nickname, message: text }
            if (this.history[id].length >= 5) {
                this.history[id].shift()
            }
            this.history[id].push(message)
            return true
        }
        return false
    },
    items: {},
    history: {},
}

var tokens = {
    register: function (params) {
        tokens.items.push(params)
    },
    expires: function() {
        tokens.items.forEach((item, i, arr) => {
            Date.now() - item.date.getTime() > 30 * 60 * 1000 ? arr.splice(i, 1) : null
        })
    },
    isValidToken : function (token) {
        return tokens.items.filter(item => item.token == token).length > 0 ? true : false
    },
    watch: setInterval(() => tokens.expires(), 5 * 60 * 1000),
    items: []
}
