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

module.exports = {
    makeObservable,
    Observable,
}