(function() {
"use strict";

// Monkey patching helpers from http://me.dt.in.th/page/JavaScript-override/
function override(object, methodName, callback) {
    object.prototype[methodName] = callback(object.prototype[methodName]);
}

function before(extraBehavior) {
    return function(original) {
        return function() {
            extraBehavior.apply(this, arguments)
            return original.apply(this, arguments)
        }
    }
}

function after(extraBehavior) {
    return function(original) {
        return function() {
            var returnValue = original.apply(this, arguments);
            extraBehavior.apply(this, arguments);
            return returnValue;
        };
    };
}

function compose(extraBehavior) {
    return function(original) {
        return function() {
            return extraBehavior.call(this, original.apply(this, arguments));
        };
    };
}

override(IDE_Morph, "init", after(function() {
    // Try to set a sane default for protocol and hostname. Also handle the
    // case when we're being loaded from file://
    var protocol = location.protocol;
    if(protocol !== "http:" && protocol !== "https:") {
        protocol = "http:";
    }
    var hostname = location.hostname || "localhost";

    this.remoteExecutionURL = protocol + '//' + hostname +':8888';
}));

IDE_Morph.prototype.userSetRemoteExecutionURL = function() {
    new DialogBoxMorph(
        this, // target
        'setRemoteExecutionURL', // action
        this // environment
    ).prompt(
        "Remote execution URL", // title
        this.remoteExecutionURL, // default
        this.world(), // world
        null // pic
    );
}

IDE_Morph.prototype.setRemoteExecutionURL = function(url) {
    this.remoteExecutionURL = url;
}

override(BlockMorph, "userMenu", compose(function(menu) {
    menu.addItem("execute remotely", 'executeRemotely');
    return menu;
}));

BlockMorph.prototype.executeRemotely = function() {
    var myself = this;
    var POLL_WAIT = 1000;

    var ide = this.parentThatIsA(IDE_Morph);
    var xml = ide.serializer.serialize(ide.stage);
    var spriteIdx = ide.stage.children.indexOf(this.parent.owner);
    var blockIdx = this.parent.children.indexOf(this);
    $.ajax({
        type: "POST",
        url: ide.remoteExecutionURL + '/jobs',
        data: JSON.stringify({
            sprite_idx: spriteIdx,
            block_idx: blockIdx,
            project: xml
        }),
        success: function(response, status, xhr) {
            var jobId = response.id;
            $.get(ide.remoteExecutionURL + '/jobs/' + jobId, function(response, status, xhr) {
                var state = response.state;
                if(state == "finished") {
                    // Success! Fetch the result.
                    $.get(ide.remoteExecutionURL + '/jobs/' + jobId + '/result', function(response, status, xhr) {
                        console.log(response);
                        var value = response;
                        if (myself instanceof ReporterBlockMorph) {
                            if($.isArray(value)) {
                                myself.showBubble(new ListWatcherMorph(new List(value)));
                            } else {
                                myself.showBubble(value);
                            }
                        }
                    });
                } else if(state == "error") {
                    // We died horribly, but Snappy does not have a way of
                    // telling us how we died, yet.
                    myself.showBubble("An error occurred while executing the code.")
                }
            });
        },
        error: function(xhr, status, error) {
            myself.showBubble("An error occurred: " + error);
        }
    });
};

}());
