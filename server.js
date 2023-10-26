const express = require('express');
const bp = require('body-parser');
const app = express();
const session = require('express-session');
const EmailValidator = require("email-validator");
const bcrypt =require('bcrypt');
const port =process.env.PORT || 5500;
const SECRET = process.env.SESSION_SECRET || 'kjbjhbfvhfv';
const {User,Notes} =require('./Database')
const Mailer = require("./SendMail");
const PinGenerator = require("./OTP");
const jwt = require('jsonwebtoken');


app.use(bp.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: SECRET,
    resave: false,
    saveUninitialized: true,
    cookie:
    {
        httpOnly: true,
        maxAge: 15*24*60*60*1000,
    }
}))
// if (process.env.NODE_ENV === 'production') {
//     app.use(express.static('build'));
// }

function encryption(data)
{
    return bcrypt.hashSync(data, 10);
}
function comparepass(data, stored)
{
    return bcrypt.compareSync(data, stored);
}
function signjwt(data)
{
    const payload = { data };
    let token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15d' });
    return token;
}
function verifyjwt(data)
{
    let verified = jwt.verify(data, process.env.JWT_SECRET, (err, decoded) =>
    {
        if (err) {
            return false;
        }
        else {
            return decoded;
        }
    })
    return verified;
}

app.get("/", async (req, res) =>
{
    res.send("hello");
});
app.post("/sign", async (req, res) =>
{
    let { name, email, password } = req.body;
    console.log(name, email, password);
    if (!EmailValidator.validate(email)) {
        res.json({ status: 401, message: "Email Not Accepted" });
        return;
    }
    let pass = encryption(password);
    let alreadyuser = await User.findOne({ email: email });
    if (alreadyuser) {
        return res.status(300).json({ message: "user already Exist" });
    }
    req.session.name = name;
    req.session.useremail = email;
    req.session.password = pass;
    let mailcheck = Mailer(email);
    console.log("MAIL CHECK /sign:", mailcheck);
    req.session.otp = mailcheck;
    const token = signjwt(req.session.email);
    res.status(200).json({ message: "data recieved successfully",token:token });
});
app.post("/login", async (req, res) =>
{
    let { email, password } = req.body;
    console.log(req.body);
    let user = await User.findOne({ email: email }).exec();
    console.log(user);
    if (user) {
        let storedpass = user.password;
        console.log("compare password ", comparepass(password, storedpass));
        if (!comparepass(password, storedpass)) {
            return res.status(300).json({ status: "Incorrect Password" });
        }
        let name = req.session.name;
        req.session.email = email;
        const token = signjwt(req.session.email);
        return res.status(200).json({ status: "Successfully Logged in",token:token });
    }
    res.status(404).json({ status: "User Not found" });
});

app.post("/user", (req, res) =>
{
    if (req.session.email) {
        return res.status(200).json({ img: "https://www.logolynx.com/images/logolynx/s_4b/4beebce89d681837ba2f4105ce43afac.png" });
    }
    else if(req.body.token)
    {
        let check = verifyjwt(req.body.token)
        if(!check)
        {
            return res.status(300).json({message:'Jwt not verified'}); // clear jwt token from async storage
        }
        req.session.email =check;
        return res.status(200).json({ img: "https://www.logolynx.com/images/logolynx/s_4b/4beebce89d681837ba2f4105ce43afac.png" });
    }
    else {
        res.status(500).json({ status: "No user found" });
    }
});

app.post("/userdata", async (req, res) =>
{
    try {
        let data = verifyjwt(req.body.token);
        console.log('jwt data',data);
        if(data || req.session.email)
        {
            if(data)
            {
                req.session.email =data.data;
            }
            let responce = await User.findOne({ email: req.session.email });
            console.log('responce',responce);
            req.session.name = responce?.name;
            return res.status(200).json({ name: req.session.name, email: req.session.email });
        }
        else {
            return res.status(300).json({ message: "No data found" });
        }
    } catch (error) {
        console.log('Error in /userdata',error);
        return res.status(300).json({ message: "No data found" });
    }
});
app.post("/verifyotp", async (req, res) =>
{
    let storedotp = req.session.otp;
    let otp = req.body.otp;
    console.log("inside verifyotp ", storedotp, otp);
    if (otp != storedotp) {
        return res.status(300).json({ message: "otp not verified" });
    }
    try {
        let user = new User({ name: req.session.name, email: req.session.useremail, password: req.session.password });
        req.session.email = req.session.useremail;
        await user.save();
        let note = new Notes({ email: req.session.email});
        await note.save();
    } catch (error) {
        return res.status(300).json({ message: "Data not saved in database" });
    }
    let token = signjwt(req.session.email);
    return res.status(200).json({ message: "Otp Verified",token:token });
});
app.post("/addnote", async (req, res) =>
{
    console.log("inside addnote");
    if (!req.session.user && !req.session.email) {
        console.log(req.session.email);
        console.log(req.session.user);
        return res.status(500).json({ message: "Note not added" });
    }
    req.body.email = req.session.email;
    let data = await Notes.findOne({ email: req.session.email });
    if (!data) {
        let note = new Notes({ email: req.session.email, notes: [req.body] }); // Create a new Notes document with the note
        let response = await note.save();
        if (!response) {
            return res.status(300).json({ message: "Note not added" });
        }
        return res.status(200).json({ message: "Note successfully added" });
    }
    data = await Notes.updateOne({ email: req.session.email }, { $push: { notes: req.body } });
    console.log(data);
    res.status(200).json({ message: "Data successfully added" });
    console.log("returning from add note");
    return;
});
app.get("/getnotes", async (req, res) =>
{
    if (!req.session.user && !req.session.email) {
        console.log("inside getnote, not login");
        return res.status(500).json({ message: "No data found" });
    }
    let data = await Notes.findOne({ email: req.session.email });
    console.log("inside /getnote", req.session.email);
    if (!data) {
        console.log("inside /getnote no data found");
        return res.status(300).json({ message: "No data found" });
    }
    return res.status(200).json(data.notes);
});

app.post("/deletenote", async (req, res) =>
{
    if (!req.session.user && !req.session.email) {
        return res.status(500).json({ message: "Please Login first" });
    }
    console.log("inside /deletenote", req.body.id);
    let data = await Notes.findOneAndUpdate({ email: req.session.email }, { $pull: { notes: { _id: req.body.id } } });
    console.log(data);
    if (!data) {
        return res.status(300).json({ message: "Note not deleted" });
    }
    return res.status(200).json({ message: "data deleted successfully" });
});

app.post("/updatedata", async (req, res) =>
{
    console.log("inside updatedata");
    if (!req.session.user && !req.session.email) {
        return res.status(500).json({ message: "Please Login first" });
    }

    try {
        // Find the user's data based on email
        // const user = await Notes.findOne({ email: 'shivshankarkushwaha0000@gmail.com' }).exec();
        const user = await Notes.findOne({ email: req.session.email }).exec();

        if (!user) {
            return res.status(300).json({ message: "User not found" });
        }

        // Find the index of the note to update based on _id
        const noteIndex = user.notes.findIndex((note) =>
        {
            // console.log(note._id, new ObjectId(req.body.id));
            return note._id.toString() == req.body.id;
        });
        console.log(noteIndex);
        if (noteIndex === -1) {
            return res.status(300).json({ message: "Note not found for update" });
        }

        // Update the note at the found index
        user.notes[noteIndex] = {
            _id: req.body.id,
            title: req.body.title,
            text: req.body.text,
            date: req.body.date,
        };

        // Save the updated user data
        await user.save();

        return res.status(200).json({ message: "Updated successfully" });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error: " + error });
    }
});

app.post("/resetpassword",async(req,res)=>
{
    if(req.session.email)
    {
        let hashedpassword = encryption(req.body.password);
        let responce = await User.updateOne({email:req.session.email},{$set:{password:hashedpassword}});
        if(!responce)
        {
            return res.status(300).json({message:'Password not updated'})
        }
        else
        {
            return res.status(200).json({message:'paasword updated successfully'});
        }
    }
    else
    {
        return res.status(300).json({message:'User not found'});
    }
})
app.get("/logout", (req, res) =>
{
    try {
        req.session.destroy();
        res.clearCookie('user');
    } catch (error) {
        res.status(400).json({ status: "not logout" });
        return;
    }
    res.status(200).json({ status: "Successfully Logged Out" });
});



app.get('*',(req,res)=>
{
    res.send('404 page not found');
})
app.listen(port,()=>{console.log(`server is running on http://localhost:${ port}`)});