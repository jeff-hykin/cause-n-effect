# cause-n-effect
A simple way to observe nested changes to data.

example:
```javascript
let { makeObservable } = require("cause-n-effect")

// 
// object
// 
let smartData = makeObservable(
    // normal data
    {
        a: { a_a: "nested", a_b: "" },
        c: 10,
    },
    // change listener
    (keyList, value)=>{
        console.log(`keyList: ${JSON.stringify(keyList)}, value: ${JSON.stringify(value)}`)
    }
)
smartData.b = 20
// >>> keylist: ["b"], value: 20
smartData.a.a_a = "hello"
// >>> keylist: ["a","a_a"], value: "hello"
smartData.a.a_b = "world"
// >>> keylist: ["a","a_b"], value: "world"
smartData.c = {
    c_a: "testing",
    c_b: {
        c_a_a: "deep testing",
    }
}
// >>> keylist: ["c"], value: {"c_a":"testing","c_b":{"c_a_a":"deep testing"}}
smartData.c.c_b.c_a_a = "deep assignment success" 
// >>> keylist: ["c","c_b","c_a_a"], value: "deep assignment success"
console.log(JSON.stringify(smartData))
// >>> '{"a":{"a_a":"hello","a_b":""},"c":{"c_a":"testing","c_b":{"c_a_a":"deep assignment success"}},"b":20}'


// 
// array
// 
smartData = makeObservable(
    // normal data
    [
        1,
        2,
        3,
        {
            "4_a": { "4_a_a": "nested", "4_a_b": "" },
            nestedList: [
                5,6,7
            ]
        }
    ],
    // change listener
    (keyList, value)=>{
        console.log(`keyList: ${JSON.stringify(keyList)}, value: ${JSON.stringify(value)}`)
    },
)
smartData.push(-100)
// >>> keyList: ["5"], value: -100

smartData.shift()
// >>> keyList: ["0"], value: 2
// >>> keyList: ["1"], value: 3
// >>> keyList: ["2"], value: {"4_a":{"4_a_a":"nested","4_a_b":""},"nestedList":[5,6,7]}
// >>> keyList: ["3"], value: -100
// >>> keyList: ["4"], value: undefined

smartData[2].nestedList.push(10)
// >>> keyList: ["2","nestedList","3"], value: 10
```


### Advanced Usage
```javascript
let { makeObservable, Observable } = require("cause-n-effect")
let smartData = makeObservable(
    // normal data
    {
        a: { a_a: "nested", a_b: "" },
        c: 10,
    },
    // change listener
    (keyList, value)=>{
        console.log(`keyList: ${JSON.stringify(keyList)}, value: ${JSON.stringify(value)}`)
    }
)

// list of functions
Observable.listeners(smartData)

// add an additionall callback
Observable.listeners(smartData).push((keyList, value)=>{ /* do something */ })
```

Possible Future Features:
- Specific value for deltions `Observable.deleted` instead of undefined
- Listen on `get` instead of only on `set`
- Have an Observable.silentSet(smartData, keyList, value) that doesn't trigger callbacks
- Support for Sets
- Support for Maps
