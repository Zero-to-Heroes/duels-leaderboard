# Test it

```
npm run build && sam local start-api

curl -X POST http://127.0.0.1:3000/overwolf-OW_2c40f5f0-4b1c-476a-98c0-d6ac63508d4b
```

# Deploy

```
npm run build && npm run package && npm run deploy

rm -rf dist && tsc && rm -rf dist/node_modules && npm publish --access=public
```

# Reference

Used this project as template: https://github.com/alukach/aws-sam-typescript-boilerplate
