require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_LINK).then(() =>
{
    console.log('Database connected');
});

const schema = new mongoose.Schema({
    name: String,
    email: String,
    password: String
});
const noteschema = new mongoose.Schema({
    email: String,
    notes: [{
        title: String,
        text: String,
        date: Date,
    }]
});
const Notes = mongoose.model('note', noteschema);
const User = mongoose.model('user', schema);
module.exports = { User,Notes };
