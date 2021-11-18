# cause-n-effect
A simple way to observe nested changes to data.

example:
```javascript
const { Reactive } = require("cause-n-effect")


const thing = Reactive({
    onUpdate: (changeList)=>console.log("updating:", changeList),
})

// 
// set value
// 
thing.setValue({ a: { b: 1 }}) // verbose way
thing.$.a.$.b = 11             // set a nested value (still triggers update)
thing.$.a.$.b(11)              // alternative update method
thing.setValue("newValue")     // top level primitive value is allowed
thing("newValue")              // alternative syntax

// 
// get value
// 
thing.toObject()          // converts to javascript object/primitive recursively
thing.grab(["a","b","c"]) // takes a keyList and returns a javascript object/primitive
thing.$                   // gets the value of "thing" (shallow value)
thing.$.a.$               // gets the value of "a" (shallow value)
```

Possible Future Features:
- Specific value for deltions `Observable.deleted` instead of undefined
- Have an Observable.silentSet(smartData, keyList, value) that doesn't trigger callbacks
- Support for Sets
- Support for Maps
