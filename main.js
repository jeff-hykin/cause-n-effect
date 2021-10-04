const isReactiveSymbol   = Symbol("is-reactive")
const makeReactiveSymbol = Symbol("make-reactive")
const doesntExist        = Symbol("doesnt-exist")

// 
// 
// tests
// 
// 
    // let a = Reactive({initialValue: {a:"hi", b:[1,2,3,4,5]}})
    // a.onUpdate.push((changes)=> {  console.log("this changed:", changes)  })

const convertToReactiveContainer = (data, self) => {
    if (isPrimitive(data)) {
        return data
    } else if (data[makeReactiveSymbol] instanceof Function) {
        return data[makeReactiveSymbol](data, self)
    } else {
        // TODO: add more explaination of what to do
        throw Error(`I'm not sure how to make this value reactive\nconstructor name: ${data.constructor.name}\nvalue: ${data}\n\nIf this is a custom class, please add a [Reactive.makeReactiveSymbol] key to the class that converts it to a reactive value`)
    }
}

// data needs to be the proxy or primitive

function Reactive({initialValue, onUpdate}) {
    const self = (value)=>self.setValue(value)
    // reactive attributes
    Object.assign(self, {
        [isReactiveSymbol]: self,
        setValue(...args) {
            if (args.length == 0) { return self.$ }
            const [newValue] = args
            // if downgrading from object to primitive, disown all children
            if (!self.isPrimitive && isPrimitive(newValue)) {
                self.disownAll()
            }
            
            // TODO: what to do if given a reactive as a newValue

            // if something changed
            if (newValue !== self.$) {
                const oldValue = self.$
                // the top level will be vanilla javascript, but the values (object/array) will all be reactives
                self.$ = convertToReactiveContainer(newValue, self)
                // tell about the update
                self.update([
                    [[], newValue, oldValue ],
                ])
            }
            
            return self
        },
        $: initialValue,
        isPrimitive: isPrimitive(initialValue),
        children: {}, // key is well, the key/attribute, value is a reactive.self
        parents: new Map(), // keys are Reactives.self, value is a object of callback functions, each callback is bundled with a relationship (encase two keys point to the same child)
        disown(childKey) {
            // remove self as parent
            const parents = self.children[childKey].parents
            const parentConnection = parents.get(self)
            delete parentConnection[childKey]
            // remove child
            delete self.children[childKey]
        },
        adopt(childKey, child) {
            self.children[childKey] = child
            
            // add a parent relationship
            // create object if its not there (sometimes the same child exists under two different names)
            if (!(self.children[childKey].parents.get(self) instanceof Object)) {
                self.children[childKey].parents.set(self, {})
            }
            // add the onUpdate callback
            self.children[childKey].parents.get(self)[childKey] = self.update
        },
        disownAll() {
            for (const each of self.children) {
                self.disown(each)
            }
        },
        update(changes) {
            // run all the parent callbacks
            for (const eachParent of self.parents) {
                for (const [key, eachParentCallback] of Object.entries(eachParent)) {
                    eachParentCallback(
                        // add the key to the keylist before calling
                        changes.map(([ keyList, newValue, oldValue ])=>[[key, ...keyList], newValue, oldValue])
                    )
                }
            }
            // run all the custom callbacks
            for (const each of onUpdate) {
                try {
                    each(changes)
                } catch (error) {}
            }
            
            // FIXME: check for recursive updates
            // FIXME: add the functional watcher here (e.g. did thing.thing.thing change)
        },
        onUpdate: onUpdate ? [onUpdate] : [],
        whenKeyUpdated: whenKeyUpdated ? [whenKeyUpdated] : [],
        whenKeyValueChanges: whenKeyValueChanges ? [whenKeyValueChanges] : [],
    })
    self.$ = convertToReactiveContainer(initialValue, self)
    return self
}

Array.prototype[makeReactiveSymbol] = (value, self) => {
    // recursively convert each thing to be reactive
    // create a relationship-callback and attach it to each of the children
    let index = 0
    self.untrackedValue = []
    for (const each of value) {
        const address = index++
        // if it wasn't reactive, then make it reactive
        const child = each[isReactiveSymbol] || Reactive({initialValue: each})
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
        changes.length && self.update(changes)
        return changes
    }
    
    const priorityObject = {
        fill(value, start=0, end=undefined) {
            if (end === undefined || end > self.untrackedValue.length) { end = self.untrackedValue.length }
            const changes = []
            const newValue = ((value instanceof Object) && value[isReactiveSymbol]) || Reactive({data: value})
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
            changes.length && self.update(changes)
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
            self.update([
                [["length"], index, index+1 ],
                [[index], doesntExist, oldValue ],
            ])
            self.disown(index)
            return oldValue
        },
        push(...newValues) {
            // ensure the value is reactive before saving it
            newValues = newValues.map( newValue => newValue[isReactiveSymbol] || Reactive({initialValue: newValue}) )
            const index = self.untrackedValue.length
            for (const [newishIndex, newValue] of Object.entries(newValues)) {
                self.adopt(index+newishIndex, newValue)
            }
            self.untrackedValue.push(...newValues)
            self.update([
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
                self.update(changes)
                return oldValue
            }
        },
        unshift(...newValues) {
            // convert them to be reactive
            newValues = newValues.map( newValue => newValue[isReactiveSymbol] || Reactive({initialValue: newValue}) )
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
            self.update(changes)
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
            changes.length && self.update(changes)
            return output
        },
        // FIXME: maybe need to add all other array methods and return reactive versions of the results
    }
    // attach a bunch of things to emulate an array
    self.$ = Proxy(self.untrackedValue, {
        // FIXME: proxy stuff
        // Getter
            // prioritize the priorityObject
        // Setter
            // track each assignment
            // track the length assignment
        // Deleter
            // track 
    })
    
    return self.$
}


// Complex
// - Object
// - Array
// - date
// - regex


function isPrimitive(value) {
    const type = typeof value
    return value == null || !(type === 'object' || type === 'function')
}