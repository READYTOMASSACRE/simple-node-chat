(function($, document, window) {
let title = 'Simple chat v.0.1'
    , messages = 0
    , activePage = true

// console.log($.cookie('name', 'value'))
function escapeHtml(text) {
  return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
}
String.prototype.format = String.prototype.f = function(){
	var args = arguments
	return this.replace(/\{(\d+)\}/g, function(m,n){
		return args[n] ? args[n] : m
	})
}
$('#chat').hide()

window.onblur = function() {
    messages = 0
    activePage = false
}
$(document).prop('title', title);
window.onfocus = function() {
    messages = 0
    activePage = true
    $(document).prop('title', title)
}

var ws = new WebSocket ('ws://' + location.host)
setTimeout(function() {
    ws.send (JSON.stringify ({
        type: 'onRefreshToken',
        token: $.cookie('token') ? $.cookie('token') : null,
    }))
}, 1000)

ws.onmessage = function (message) {
    var event = JSON.parse(message.data)
    switch(event.type) {
        case 'onRender':
            if (event.count) {
                $('.online-users').html(event.count)
            }
            if (event.nickname || event.nickname === 0) {
                $('.nickname').html(event.nickname.toString())
            }
            if (event.members) {
                $('.room-members').html(event.members)
            }
            if (event.rooms) {
                room.render(event.rooms)
            }
            if (event.room) {
                if (event.room != 'delete') {
                    var history = event.history ? event.history : []
                    room.renderHistory(history)
                    $('#chat').show()
                    $('#chat').attr('data-room', event.room.id)
                    $('#chat').find('input').focus()
                    $('.room-name').html(event.room.id)
                    $('.room-owner').html(event.room.owner.nickname.toString())
                    $('.room-members').html(event.room.members.length)
                } else {
                    $('#chat').hide()
                    $('#chat').attr('data-room', null)
                }
            }
            if (event.message) {
                room.renderMessage(event.author, escapeHtml(event.message), event.error ? 'error' : null)
            }
            if (event.writing) {
                event.writing === 'start' ? room.renderWriting(event.author) : room.removeWriting()
            }
            if (event.token) {
                $.cookie('token', event.token, {expires: new Date(new Date().getTime() + 30 * 60 * 1000)});
            }
            break
        default:
            break
    }
}
$(document).on('keydown', '#chat', function(event) {
    if (event.which === 13) {
        let button = $(this).find('button')
        let action = button.attr('data-action')
        switch (action) {
            case 'chat':
                room.chat($(button).closest('div').find('input'))
                break
            default:
                break
        }
    }
})
$(document).on('click', 'button', function(event) {
    var action = $(this).attr('data-action')
    if (!action) return
    switch(action) {
        case 'create':
            ws.send (JSON.stringify ({
                type: 'onCreateRoom',
            }))
            break
        case 'enter':
            var id = $(this).closest('tr').attr('data-room')
            ws.send (JSON.stringify ({
                type: 'onEnterRoom',
                room: id,
            }))
            break
        case 'chat':
            room.chat($(this).closest('div').find('input'))
        default:
            break
    }
    return
})
room = {
    add: function(item) {
        var html = "<tr data-room=\"" + item.id.toString() + "\">"
        html += "<td>{0}</td><td>{1}</td>".format(item.id.toString(), item.owner.nickname.toString())
        html += "<td><button class=\"btn btn-primary\" data-action=enter><span class=\"glyphicon glyphicon glyphicon-log-in\" aria-hidden=\"true\"></span>&nbsp;Войти</button></td>"
        html += "</tr>"
        $(html).appendTo($('#rooms tbody'))
    },
    render: function(rooms) {
        var self = this
        $('#rooms tbody').html('')
        Object.keys(rooms).map((index) => self.add(rooms[index]))
    },
    renderHistory: function(history) {
        $('#chat').find('.panel-body').find('.container').html('')
        var element = $('#chat').find('.panel-body').find('.container')
        let html = "<div class=\"row message-bubble\">"
        html += "<small><i>Чат запущен</i></small>"
        html += "</div>"
        html += "<hr>"
        $(html).appendTo(element)
        history.forEach(item => room.renderMessage(item.author, item.message, 'history'))
        let panel = element.closest('div.panel-body')
        panel.scrollTop(panel[0].scrollHeight)
    },
    renderMessage: function(author, message, type) {
        var element = $('#chat').find('.panel-body').find('.container')
        if (element) {
            let date = new Date()
            let html = "<div class=\"row message-bubble\">"

            switch (type) {
                case 'error':
                    html += "<small><i>{0}</i></small>".format(escapeHtml(message))
                    break
                case 'history':
                default:
                    messages++
                    if (!activePage) $(document).prop('title', messages > 0 ? 'New message! * (+' + messages + ')' : title)
                    html += "<p class=\"text-muted\"><strong>{0}</strong>, <small><i>отправлено {1}</i></small></p>".format(author.toString(), date.toLocaleString())
                    html += "<p>{0}</p>".format(escapeHtml(message))
                    break
            }
            html += "</div>"
            html += "<hr>"
            $(html).appendTo(element)
            let panel = element.closest('div.panel-body')
            switch (type) {
                case 'error':
                    panel.scrollTop(panel[0].scrollHeight)
                    break
                case 'history':
                    break
                default:
                    panel.animate({ scrollTop: panel[0].scrollHeight}, "fast")
                    break
            }
        }
    },
    renderWriting: function(author) {
        let alreadyWriting = $('.writing')
        if (!alreadyWriting) {
            let html = "<i class=\"writing\"><small><strong>{0}</strong> writing...</small></i>".format(author.toString())
            let element = $('.panel-body').find('.container')
            $(html).appendTo(element)
        }
    },
    removeWriting: function() {
        $('.writing').remove()
    },
    chat: function(element) {
        let text = element.val().trim()
        element.val('')
        if (!text || text === null) return false
        if (text.length < 256) {
            messages++
            ws.send (JSON.stringify ({
                type: 'onChatRoom',
                message: text
            }))
            return true
        } else {
            return false
        }
    }
}
$(document).on('keypress', '.panel-footer input', function(event) {
    let typing = $('.panel-footer input').val().trim().length > 0 ? true : false
    if (typing) {
        ws.send (JSON.stringify ({
            type: 'onTypeChat',
            writing: 'start'
        }))
    } else {
        ws.send (JSON.stringify ({
            type: 'onTypeChat',
            writing: 'stop'
        }))
    }
})
})(jQuery, jQuery(document), window)
