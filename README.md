# cause-n-effect
Perfect two way databinding in Javascript


example:
```javascript
let someData = LiveManager()
// normal assignment
someData.a = 10
someData.b = 20

// binding data
someData.a = someData.b
someData.b = 69
console.log(someData.a.value) // 69

// adding a listener
someData.b.addListener(newValue=>console.log("b changed to ",newValue))
someData.a = 30 // will output "b changed to 30"
```