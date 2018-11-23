// if running inside node
if (typeof window == "undefined") {
    window = global
}

let liveValuesOf = Symbol("liveValuesOf")
let valueOf      = Symbol("liveValueOf")
let listenersOf  = Symbol("liveListenersOf")
window[liveValuesOf] = {}
window[valueOf]      = {}
window[listenersOf]  = {}
// TODO add support for checking nested values
class LiveValue {
    constructor(intialValue) {
        this.sourceId = Symbol()
        window[valueOf][this.sourceId] = intialValue
        window[listenersOf][this.sourceId] = new Set()
        window[liveValuesOf][this.sourceId] = new Set([this])
    }
    unbind() {
        this.sourceId = Symbol()
        window[listenersOf][this.sourceId] = new Set()
        window[liveValuesOf][this.sourceId] = new Set([this])
    }
    bindTo(newLiveValue) {
        let oldSourceId = this.sourceId
        let newSourceId = newLiveValue.sourceId
        if (oldSourceId != newSourceId) {
            this.sourceId = newLiveValue.sourceId
            // 
            // Update live values
            // 
            for (let each of window[liveValuesOf][oldSourceId]) {
                // change local binding
                each.sourceId = newSourceId
                // change global binding
                window[liveValuesOf][newSourceId].add(each)
            }
            //
            // Update listeners
            //
            // move listeners
            let listenersBeforeBinding = []
            for (let each of window[listenersOf][oldSourceId]) {
                listenersBeforeBinding.push(each)
                window[listenersOf][oldSourceId].add(oldSourceId)
            }
            // call this listeners for everything that changed binding
            // TODO, this is syncronous, it should maybe be async
            listenersBeforeBinding.forEach(each=>each(window[valueOf][newSourceId]))
        }
    }
    set value(newValue) {
        // set the new value
        window[valueOf][this.sourceId] = newValue
        // run all the listeners
        for (let each of this.listeners) {
            each(newValue)
        }
    }
    get value() {
        return window[valueOf][this.sourceId]
    }
    valueOf() {
        return this.value
    }
    addListener(aFunction) {
        window[listenersOf][this.sourceId].add(aFunction)
    }
    removeListener() {
        window[listenersOf][this.sourceId].delete(aFunction)
    }
    get listeners() {
        return window[listenersOf][this.sourceId]
    }
}
function LiveManager() {
    return new Proxy({}, {
            ownKeys : (target)=>Reflect.ownKeys(target),
            has : (target, key)=>key in target,
            set : function (target, key, newValue) {
                    if (newValue instanceof LiveValue) {
                        // if there is no existing value
                        if (target[key] == null) {
                            // just assign it
                            target[key] = newValue
                        // if there is an existing value, then overwrite the old with the new
                        } else {
                            target[key].bindTo(newValue)
                        }
                    // if its a normal value
                    } else {
                        // if there is no existing value
                        if (target[key] == null) {
                            // create a live value
                            target[key] = new LiveValue(newValue)
                        // if there is an existing value, then overwrite the old with the new
                        } else {
                            target[key].value = newValue
                        }
                    }
                },
            get :(target, key) => target[key],
            construct : ()=> this
        }
    )
}



function attachTo(context) {
    context.LiveManager = LiveManager
    context.LiveValue = LiveValue
}
// if there is no exporting system
if(typeof exports == "undefined"){
    attachTo(window)
// if there is an export system
} else {
    attachTo(module.exports)
}
