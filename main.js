const isReactiveSymbol   = Symbol("is-reactive")
const makeReactiveSymbol = Symbol("make-reactive")
const doesntExist        = Symbol("doesnt-exist")
// 
// Object watcher
// 
Object.prototype[makeReactiveSymbol] = (value, theReactiveItem) => {
    // populate the children
    for (const [key, each] of Object.entries(value)) {
        theReactiveItem.adopt(key, each)
    }

    // wrap the primitive object with a proxy
    return new Proxy(theReactiveItem.children, {
        get(original, key, ...args) {
            return Reflect.get(original, key, ...args)
        },
        set(original, key, newValue) {
            const oldValue = key in original ? original[key] : doesntExist
            // if its a new value, disown the old one
            let shouldTriggerUpdate = false
            if (oldValue != doesntExist && oldValue !== newValue) {
                shouldTriggerUpdate = true
                theReactiveItem.disown(key)
            }
            // either way adopt the new value
            theReactiveItem.adopt(key, newValue)
            // trigger update if there was a change
            shouldTriggerUpdate && theReactiveItem.triggerUpdate([
                [[key], original[key], oldValue ]
            ])
            return true
        },
        delete(original, key) {
            const oldValue = key in original ? original[key] : doesntExist
            theReactiveItem.disown(key)
            theReactiveItem.triggerUpdate([
                [[key], doesntExist, oldValue ]
            ])
        },
    })
}

// 
// 
// Reactive
// 
// 
function Reactive({initialValue, onUpdate}) {
    let init = true
    // if initial value is reactive just immediately use it, don't double-wrap
    if (initialValue instanceof Object && initialValue[isReactiveSymbol]) {
        if (onUpdate instanceof Function) {
            initialValue.updateListeners.push(onUpdate)
        }
        return initialValue
    } 
    const thisReactiveItem = (...args)=>thisReactiveItem.setValue(...args)
    // reactive attributes
    Object.assign(thisReactiveItem, {
        [isReactiveSymbol]: thisReactiveItem,
        $: undefined, // $ will be equal to a proxy
        setValue(...args) {
            if (args.length == 0) { return thisReactiveItem.$ }
            const [newValue] = args
            const newValueIsPrimitive = isPrimitive(newValue)
            // if downgrading from object to primitive, disown all children
            if (!thisReactiveItem.isPrimitive && isPrimitive(newValue)) {
                thisReactiveItem.disownAll()
            }
            
            // TODO: what to do if given a reactive as a newValue

            // if something changed
            if (newValue !== thisReactiveItem.$) {
                const oldValue = thisReactiveItem.$
                if (newValueIsPrimitive) {
                    thisReactiveItem.$ = newValue
                    thisReactiveItem.isPrimitive = true
                } else if (newValue[makeReactiveSymbol] instanceof Function) {
                    thisReactiveItem.$ = newValue[makeReactiveSymbol](newValue, thisReactiveItem)
                    thisReactiveItem.isPrimitive = false
                } else {
                    // TODO: add more explaination of what to do
                    throw Error(`I'm not sure how to make this value reactive\nconstructor name: ${data.constructor.name}\nvalue: ${data}\n\nIf this is a custom class, please add a [Reactive.makeReactiveSymbol] key to the class that converts it to a reactive value`)
                }
                // tell about the update
                thisReactiveItem.triggerUpdate([
                    [[], newValue, oldValue ],
                ])
            }
            return thisReactiveItem
        },
        grab(keyList) {
            let runningValue = thisReactiveItem
            try {
                while (keyList.length) {
                    const next = keyList.shift()
                    runningValue = runningValue.$[next]
                }
            } catch (error) {
                return doesntExist
            }
            return runningValue.$
        },
        isPrimitive: isPrimitive(initialValue),
        children: {}, // key is well, the key/attribute, value is always a reactive
        parents: new Map(), // keys are Reactives.thisReactiveItem (<- the parent), value is a object of keys (key being parent[key]=this) with values being callback functions
        disown(childKey) {
            // remove thisReactiveItem as parent
            const parents = thisReactiveItem.children[childKey].parents
            const parentConnection = parents.get(thisReactiveItem)
            delete parentConnection[childKey]
            // remove child
            delete thisReactiveItem.children[childKey]
        },
        adopt(childKey, child) {
            thisReactiveItem.children[childKey] = Reactive({initialValue: child})
            
            // add a parent relationship
            // create object if its not there (sometimes the same child exists under two different names)
            if (!(thisReactiveItem.children[childKey].parents.get(thisReactiveItem) instanceof Object)) {
                thisReactiveItem.children[childKey].parents.set(thisReactiveItem, {})
            }
            // add the onUpdate callback
            thisReactiveItem.children[childKey].parents.get(thisReactiveItem)[childKey] = thisReactiveItem.triggerUpdate
        },
        disownAll() {
            const changes = []
            for (const [key, value] of Object.entries()) {
                changes.push([[key], doesntExist, value])
                thisReactiveItem.disown(key)
            }
            return changes
        },
        triggerUpdate(changes) {
            // don't trigger on init
            if (init) {
                init = false
                return
            }
            // run all the parent callbacks
            for (const eachParent of thisReactiveItem.parents.values()) {
                for (const [key, eachParentCallback] of Object.entries(eachParent)) {
                    eachParentCallback(
                        // add the key to the keylist before calling
                        changes.map(([ keyList, newValue, oldValue, baseList ])=>[[key, ...keyList], newValue, oldValue, baseList||keyList])
                    )
                }
            }
            // run all the custom callbacks
            for (const each of thisReactiveItem.updateListeners) {
                try {
                    each(changes)
                } catch (error) {}
            }
            
            // 
            // run the watchers
            // 
            // create a fail-fast tool
                // FIXME
                //    1. attach watcher on adopt 
                //    2. deattach watcher on disown
                //    3. trigger watcher on higher-up getting downgraded from object to primitive
                //    4. attach watcher on watch
                //    5. test the edgecase of .length for arrays
                //    6. every time a parent reactive value changes, check watcher, detach old and reattach new if changed
        },
        watchers: new Map(), // keys are keyLists, values are [prevValue, a set of callbacks]
        watch(keyList, callback) {
            const callbacks = thisReactiveItem.watchers.get(keyList) || new Set()
            callbacks.add(callback)
            thisReactiveItem.watchers.set(keyList, callbacks)
        },
        updateListeners: onUpdate ? [onUpdate] : [],
        // whenKeyUpdated: whenKeyUpdated ? [whenKeyUpdated] : [],
        // whenKeyValueChanges: whenKeyValueChanges ? [whenKeyValueChanges] : [],
        toObject(scheduled=new Map()) {
            if (thisReactiveItem.isPrimitive) {
                return thisReactiveItem.$
            } else {
                let value = {}
                scheduled.set(thisReactiveItem, value)
                console.debug(`Object.entries(thisReactiveItem.children) is:`,Object.entries(thisReactiveItem.children))
                for (const [key, childValue] of Object.entries(thisReactiveItem.children)) {
                    // if already visited
                    if (scheduled.has(childValue)) {
                        value[key] = scheduled.get(childValue)
                    } else {
                        value[key] = childValue.toObject(scheduled)
                    }
                }
                return value
            }
        },
        toJSON(...args) {
            return JSON.stringify(thisReactiveItem.toObject(),...args)
        }
    })
    thisReactiveItem.setValue(initialValue)
    return thisReactiveItem
}
// attach for external use
Reactive.doesntExist = doesntExist

// 
// Array Watcher
// 
Array.prototype[makeReactiveSymbol] = (value, self) => {
    // recursively convert each thing to be reactive
    // create a relationship-callback and attach it to each of the children
    let index = 0
    self.untrackedValue = []
    for (const each of value) {
        const address = index++
        // if it wasn't reactive, then make it reactive
        const child = Reactive({initialValue: each})
        // add the child
        self.adopt(address, child)
        self.untrackedValue.push(child)
    }

    const handleChanges = (origial) => {
        const changes = []
        for (let index = 0; index < self.untrackedValue.length; index++) {
            const oldValue = origial[index]
            const newValue = self.untrackedValue[index]
            // check if it actually changed
            if (oldValue !== newValue) {
                changes.push([[index], newValue, oldValue ])
                // detach the old
                self.disown(index)
                // attach the new
                self.adopt(index, newValue)
            }
        }
        changes.length && self.triggerUpdate(changes)
        return changes
    }
    
    const priorityObject = {
        fill(value, start=0, end=undefined) {
            if (end === undefined || end > self.untrackedValue.length) { end = self.untrackedValue.length }
            const changes = []
            const newValue = Reactive({data: value})
            // FIXME: handle negative numbers https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/fill
            while (end > start) {
                const key = start++
                const oldValue = self.untrackedValue[key]
                if (newValue !== oldValue) {
                    changes.push([ [key], newValue, oldValue ])
                    // detach the old
                    self.disown(key)
                    // attach the new
                    self.adopt(key, newValue)
                }
            }
            self.untrackedValue.fill(newValue, start, end)
            // call the update if any changes were made
            changes.length && self.triggerUpdate(changes)
            return self
        },
        sort(...args) {
            const origial = [...self.untrackedValue]
            self.untrackedValue.sort(...args)
            handleChanges(origial)
        },
        pop() {
            const oldValue = self.untrackedValue.pop()
            const index = self.untrackedValue.length
            self.triggerUpdate([
                [["length"], index, index+1 ],
                [[index], doesntExist, oldValue ],
            ])
            self.disown(index)
            return oldValue
        },
        push(...newValues) {
            // ensure the value is reactive before saving it
            newValues = newValues.map( newValue => Reactive({initialValue: newValue}) )
            const index = self.untrackedValue.length
            for (const [newishIndex, newValue] of Object.entries(newValues)) {
                self.adopt(index+newishIndex, newValue)
            }
            self.untrackedValue.push(...newValues)
            self.triggerUpdate([
                [["length"], index+newValues.length, index ],
                ...newValues.map((newValue, index)=>[ [index], newValue, doesntExist ]),
            ])
            return self.untrackedValue.length
        },
        reverse() {
            // theres a slightly more efficient way to do this
            const beforeReverse = [...self.untrackedValue]
            self.untrackedValue.reverse()
            handleChanges(beforeReverse)
        },
        shift() {
            if (self.untrackedValue.length > 0) {
                const oldValue = self.untrackedValue.shift()
                const changes = [
                    [["length"], self.untrackedValue.length, self.untrackedValue.length+1 ]
                ]
                // iterate over all but the last one
                for (let index = 0; index < self.untrackedValue.length-1; index++) {
                    const oldValue = self.untrackedValue[index+1]
                    const newValue = self.untrackedValue[index]
                    // check if it actually changed
                    if (oldValue !== newValue) {
                        changes.push([[index], newValue, oldValue ])
                        // detach the old
                        self.disown(index)
                        // attach the new
                        self.adopt(index, newValue)
                    }
                }
                // manually do the last one
                changes.push([[self.untrackedValue.length], doesntExist, self.untrackedValue.slice(-1) ])
                self.disown(self.untrackedValue.length)
                self.triggerUpdate(changes)
                return oldValue
            }
        },
        unshift(...newValues) {
            // convert them to be reactive
            newValues = newValues.map( newValue => Reactive({initialValue: newValue}) )
            const changes = [
                [["length"], self.untrackedValue.length+newValues.length, self.untrackedValue.length]
            ]
            const numberOfPreexistingItems = self.untrackedValue.length
            self.untrackedValue.unshift(...newValues)
            // 
            // iterate over preexisting
            // 
            const offset = newValues.length
            for (let index = 0; index < numberOfPreexistingItems; index++) {
                const oldValue = self.untrackedValue[index+offset]
                const newValue = self.untrackedValue[index]
                // check if it actually changed
                if (oldValue !== newValue) {
                    changes.push([[index], newValue, oldValue ])
                    // detach the old
                    self.disown(index)
                    // attach the new
                    self.adopt(index, newValue)
                }
            }
            // 
            // iterate over new items
            // 
            for (let index = numberOfPreexistingItems; index < numberOfPreexistingItems+newValues.length; index++) {
                const oldValue = doesntExist
                const newValue = self.untrackedValue[index]
                // check if it actually changed
                if (oldValue !== newValue) {
                    changes.push([[index], newValue, oldValue ])
                    // attach the new
                    self.adopt(index, newValue)
                }
            }
            self.triggerUpdate(changes)
            return self.untrackedValue.length
        },
        splice(start, deleteCount, ...items) {
            const lengthBefore = self.untrackedValue.length
            const sizeIncrease = items.length - deleteCount.length
            const beforeList = self.untrackedValue.slice(start)
            if (sizeIncrease) {
                beforeList.push(Array(sizeIncrease).fill(doesntExist))
            }
            const output = self.untrackedValue.splice(start, deleteCount, ...items)
            const afterList = self.untrackedValue.slice(start)
            if (sizeIncrease < 0) {
                afterList.push(Array(-sizeIncrease).fill(doesntExist))
            }
            
            const changes = []
            // check length change
            if (lengthBefore != self.untrackedValue.length) {
                changes.push([["length"], self.untrackedValue.length, lengthBefore])
            }
            // check item changes
            for (let index = start; index < start + afterList.length; index++) {
                const oldValue = beforeList[index]
                const newValue = afterList[index]
                // check if it actually changed
                if (oldValue !== newValue) {
                    changes.push([[index], newValue, oldValue ])
                    // detach the old
                    ;(oldValue != doesntExist) && self.disown(index)
                    // attach the new
                    ;(newValue != doesntExist) && self.adopt(index, newValue)
                }
            }
            changes.length && self.triggerUpdate(changes)
            return output
        },
        // FIXME: maybe need to add all other array methods and return reactive versions of the results
    }
    // attach a bunch of things to emulate an array
    self.$ = new Proxy(self.untrackedValue, {
        get(target, key) {
            return priorityObject[key] || target[key]
        },
        set(target, key, newValue) {
            const valueBefore = key in target ? target[key] : doesntExist
            const lengthBefore = target.length
            const changes = []
            // if the value existed, disown it
            if (valueBefore != doesntExist) {
                self.disown(key)
            }
            target[key] = Reactive({initialValue: newValue})
            if (lengthBefore != target.length) {
                changes.push([["length"], target.length, lengthBefore])
            }
            // FIXME: edgecase; a = [1], a[99] = 10, creates a bunch of "empty" items
            if (valueBefore !== target[key]) {
                changes.push([[key], target[key], valueBefore ])
            }
            self.adopt(key, target[key])
            self.triggerUpdate(changes)
        },
        delete(target, key) {
            self.disown(key)
            delete target[key]
        },
    })
    
    return self.$
}

function isPrimitive(value) {
    const type = typeof value
    return value == null || !(type === 'object' || type === 'function')
}

module.exports = Reactive