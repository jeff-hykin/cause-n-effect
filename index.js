let _ = require("lodash")

let Observable
Observable = {
    listenersSymbol: Symbol("Observable.listenersSymbol"),
    listeners(object) {
        return object[Observable.listenersSymbol]
    }
}
let hookIntoChildChanges = (key, object) => (keyList, value)=>{
    const newKeyList = [key, ...keyList]
    for (let each of object[Observable.listenersSymbol]) {
        if (each instanceof Function) {
            each(newKeyList, value)
        }
    }
}
function makeObservable(object, onChange) {
    if (object instanceof Array) {
        return makeProxyArray(object, onChange)
    } else if (object instanceof Object) {
        return makeProxyObject(object, onChange)
    } else {
        return object
    }
}
function makeProxyArray(existingObject, onChange) {
    let copy = []
    copy[Observable.listenersSymbol] = [onChange]
    for (const [key, value] of Object.entries(existingObject)) {
        copy[key] = makeObservable(value, hookIntoChildChanges(key, copy))
    }
    let proxyObject
    proxyObject = new Proxy(copy, {
        get(target, key) {
            const beforeMutation = [...target]
            switch (key) {
                case 'fill': 
                case 'sort': 
                case 'flat': 
                case 'pop': 
                case 'push': 
                case 'reverse': 
                case 'shift': 
                case 'unshift': 
                    const action = key
                    return (...args)=>{
                        const result = target[action](...args)
                        const keys = new Set([ ...Object.keys(target), ...Object.keys(beforeMutation) ])
                        // check changes 
                        // TODO: make this more efficient, this is O(n) but some (like pop) are O(1)
                        for (const key of keys) {
                            // then there was a change
                            if (beforeMutation[key] !== target[key]) {
                                // make it observable
                                target[key] = makeObservable(target[key], hookIntoChildChanges(key, target))
                                // report the change
                                for (let each of target[Observable.listenersSymbol]) {
                                    if (each instanceof Function) {
                                        each([key], target[key])
                                    }
                                }
                            }
                        }
                        return result
                    }
                default:
                    break
            }
            return target[key]
        },
        set(target, key, newValue) {
            // always convert
            target[key] = makeObservable(newValue, hookIntoChildChanges(key, target))
            for (let each of target[Observable.listenersSymbol]) {
                if (each instanceof Function) {
                    each([key], newValue)
                }
            }
            return target[key]
        },
    })
    return proxyObject
}

function makeProxyObject(existingObject, onChange) {
    let copy = {}
    copy[Observable.listenersSymbol] = [onChange]
    
    for (const [key, value] of Object.entries(existingObject)) {
        // connect child changes
        copy[key] = makeObservable(value, hookIntoChildChanges(key, copy))
    }
    let proxyObject 
    proxyObject = new Proxy(copy, {
        get(target, key) {
            return target[key]
        },
        set(target, key, newValue) {
            // always convert
            target[key] = makeObservable(newValue, hookIntoChildChanges(key, target))
            for (let each of target[Observable.listenersSymbol]) {
                if (each instanceof Function) {
                    each([key], target[key])
                }
            }
            return target[key]
        },
    })
    return proxyObject
}


const ReactiveDataSymbol = Symbol("Internal")
function Reactive() {
    const reactiveData = {
        value: undefined,
        onSet: undefined,
        onSetCallbacks: new Set([]),
        parents: new Set([]),
        frozen: false,
    }
    // onSet needs to be called after reactiveData.value has been updated
    reactiveData.onSet = (alreadyCalledReactives) => {
        if (reactiveData.frozen) {
            throw Error(`It looks like this Reactive object was frozen, and then something tried to change it.\nThis almost always happens because of assigning one reactive value to another reactive value.\nFor example\n    A = Reactive()\n    B = Reactive()\n    A(B) // set A equal to B \n\nThis is problematic because\n    B(10) // set B to 10\n    console.log(A) // what is the output?\n\nThe current behavior is that A performs a deep copy when assigned to B, and then B is frozen\nTrying to change B results in this error\nIf you want A and B to be connected (e.g. changing B changes A, and vise versa)\nthen use the A.link(B)\nIf you want to change A and B independently then do A(JSON.parse(JSON.stringify(B))) so that A is just assigned to a copy of B\n\n\nThe B in this error has a value of: ${JSON.stringify(self)}`)
        }
        if (alreadyCalledReactives == undefined) {
            alreadyCalledReactives = new Set()
        }
        for (const each of reactiveData.onSetCallbacks) {
            // skip if already called somewhere else
            if (!alreadyCalledBacks.has(each)) {
                each(reactiveData.value)
                alreadyCalledBacks.add(each)
            }
        }
        // call all parents onSet
        for (const each of reactiveData.parents) {
            each[ReactiveDataSymbol].onSet(alreadyCalledReactives)
        }
    }
    let self = function (newValue) {
        // 
        // get
        // 
        if (arguments.length == 0) {
            return reactiveData.value
        // 
        // set
        // 
        } else {
            const newValueIsObject = newValue instanceof Object
            const oldValueIsObject = reactiveData.value instanceof Object
            // 
            // to primitive
            // 
            if (!newValueIsObject) {
                if (oldValueIsObject) {
                    // detach all the reactive values
                    for (const [key, value] of Object.entries(reactiveData.value)) {
                        if (value instanceof Object && value[ReactiveDataSymbol]) {
                            value[ReactiveDataSymbol].parents.delete(self)
                        }
                    }
                }
                reactiveData.onSet()
            // 
            // to object
            // 
            } else {
                // 
                // if new value is a reactive
                // 
                if (newValue[ReactiveDataSymbol]) {

                    // FIXME: make this an error, say it either needs to be a deep copy, or needs to use the bind function
                    // or just make it perform a copy, and freeze the other reactable, with an error explaination when trying to perform stuff
                    newValue[ReactiveDataSymbol].frozen = self
                    // FIXME: need to freeze things all the way down

                // if its non-reactive
                } else {
                    // freeze the original
                    Object.freeze(newValue)
                    // 
                    // Array
                    // 
                    if (newValue instanceof Array) {
                        // create array where each element is reactive
                        const target = newValue.map(each=>{
                            let child = Reactive()(each)
                            child[ReactiveDataSymbol].parents.add(self)
                            return child
                        })
                        reactiveData.value = new Proxy(target, {
                            // FIXME: handle the delete operator
                            get(target, key) {
                                const beforeMutation = [...target]
                                switch (key) {
                                    case 'fill': 
                                    case 'sort': 
                                    case 'flat': 
                                    case 'pop': 
                                    case 'push': 
                                    case 'reverse': 
                                    case 'shift': 
                                    case 'unshift': 
                                        const action = key
                                        // the wrapper
                                        return (...args)=>{
                                            // TODO: this could be much more efficient for some operations like pop or push
                                            const returnValue = target[action](...args)
                                            // check for removed, then delete the connection to the parent element if removed
                                            const removedElements = _.difference(beforeMutation, target)
                                            for (const each of removedElements) {
                                                each[ReactiveDataSymbol].parents.delete(self)
                                            }
                                            for (const [key, value] of Object.entries(target)) {
                                                // if its already reactive, it wont make a difference
                                                target[key] = Reactive()(value)
                                                target[key][ReactiveDataSymbol].parents.add(self)
                                            }
                                            // note that the value changed, call parents too
                                            reactiveData.onSet()
                                            return returnValue
                                        }
                                    default:
                                        break
                                }
                                return target[key]
                            },
                            set(target, key, newValue) {
                                // if it was reactive, then use that reactive's setter
                                if (target[key] instanceof Object) {
                                    if (target[key][ReactiveDataSymbol]) {
                                        target[key](newValue)
                                    }
                                // if it doesn't exist yet, then create it
                                } else {
                                    target[key] = Reactive()(newValue)
                                    target[key][ReactiveDataSymbol].parents.add(self)
                                    reactiveData.onSet()
                                }
                                return target[key]
                            },
                        })
                        reactiveData.onSet()
                    // 
                    // Object
                    // 
                    } else {
                        let target = {}
                        for (const [key, value] of Object.entries(newValue)) {
                            target[key] = value
                        }
                        reactiveData.value = new Proxy(target, {
                            // FIXME: handle the delete operator
                            get(target, key) {
                                return target[key]
                            },
                            set(target, key, newValue) {
                                // if it was reactive, then use that reactive's setter
                                if (target[key] instanceof Object) {
                                    if (target[key][ReactiveDataSymbol]) {
                                        target[key](newValue)
                                    }
                                // if it doesn't exist yet, then create it
                                } else {
                                    target[key] = Reactive()(newValue)
                                    target[key][ReactiveDataSymbol].parents.add(self)
                                    reactiveData.onSet()
                                }
                                return target[key]
                            },
                        })
                        reactiveData.onSet()
                    }
                }
            }
        }
    }
    Object.defineProperties(self, {
        [ReactiveDataSymbol]: {
            value: reactiveData,
            enumerable: false,
            configurable: false,
            writable: false,
        },
        addListener: {
            value: (...args) => {
                internal.onSetCallbacks.add(args.slice(-1)[0])
            },
            enumerable: false,
            configurable: false,
            writable: false,
        },
        removeListener: {
            value: (...args) => {
                internal.onSetCallbacks.remove(args.slice(-1)[0])
            },
            enumerable: false,
            configurable: false,
            writable: false,
        },
        link: {
            value: (linkedValue) => {
                if (!linkedValue[ReactiveDataSymbol]) {
                    throw Error(`called:\n    (reactive).link(linkedValue)\nbut the value wasn't a reactive. It was: ${linkedValue}, which in json is: ${JSON.stringify(linkedValue)}`)
                }
                // merge the callbacks
                for (const each of internal.onSetCallbacks) {
                    linkedValue[ReactiveDataSymbol].onSetCallbacks.add(each)
                }
                internal.onSetCallbacks = linkedValue[ReactiveDataSymbol].onSetCallbacks
                // merge the parents
                for (const each of internal.parents) {
                    linkedValue[ReactiveDataSymbol].parents.add(each)
                }
                internal.parents = linkedValue[ReactiveDataSymbol].parents
                // merge the frozenness
                internal.frozen = linkedValue[ReactiveDataSymbol].frozen = newValue[ReactiveDataSymbol] || internal.frozen
                // FIXME: frozenness probably needs to go all the way down
            },
            enumerable: false,
            configurable: false,
            writable: false,
        },
        toJSON: {
            value: () => {
                // if primitive
                if (!(reactiveData.value instanceof Object)) {
                    return reactiveData.value
                } else {
                    // if Array
                    if (reactiveData.value instanceof Array) {
                        return Object.values(reactiveData.value).map(each=>each.toJSON())
                    // if Object
                    } else {
                        let output = {}
                        for (const [key, value] of Object.values(reactiveData.value)) {
                            output[key] = value.toJSON()
                        }
                        return output
                    }
                }
            },
            enumerable: false,
            configurable: false,
            writable: false,
        },
    })
    return self
}

module.exports = {
    makeObservable,
    Observable,
    Reactive,
}