const express = require("express");
const fs = require("fs");
const bodyParser = require("body-parser");
const server = express();
const spawn = require("child_process").spawn;
const execSync = require("child_process").execSync;
const streamBuffers = require("stream-buffers");
const lwip = require("pajk-lwip");

const config = require("./config.json");

//Load folders
function loadFolders() {
    let newFiles = new Set();
    config.folders.forEach(folder => {
        let filenames = fs.readdirSync(folder);
        filenames.forEach(file => {
            newFiles.add(folder + "/" + file);
        });
    });

    config.files.forEach(file => {
        newFiles.add(file);
    });

    config.files = [...newFiles];
}
loadFolders();

//Load file lengths
function loadFileLengths() {
    let files = [];
    for (let i = 0; i < config.files.length; i++) {
        let file = { filename: config.files[i] };
        let length = execSync("ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \"" + config.files[i] + "\"");
        file.length = Number(length);
        files.push(file);
    }
    config.files = files;
}
loadFileLengths();

let cdf = [];
for (let i = 0; i < config.files.length; i++) {
    if (i == 0)
        cdf.push(config.files[0].length);
    else
        cdf.push(config.files[i].length + cdf[i - 1]);
}

server.use(bodyParser.urlencoded({ extended: false }));
server.use(bodyParser.json());

server.get("/", (req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Hello world");
});

//Weight randomness by video length
function getRandomFile() {
    let selection = cdf[cdf.length - 1] * Math.random();

    for (let i = 0; i < cdf.length; i++) {
        if (selection < cdf[i])
            return config.files[i];
    }
    return config.files[config.files.length - 1];
}

server.get("/generate", (req, res) => {
    let file = getRandomFile();
    let time = Math.random() * file.length;
    let buffer = new streamBuffers.WritableStreamBuffer({
        initialSize: 1024,
        incrementAmount: 10 * 1024
    });
    let ffmpeg = spawn("ffmpeg", [
        "-ss", time,
        "-i", file.filename,
        "-frames:v", "1",
        "-f", "image2pipe",
        "-qscale", "2",
        "pipe:1"
    ], {
        stdio: 'pipe'
    });
    ffmpeg.stdout.pipe(buffer);
    ffmpeg.stderr.on("data", (data) => {
        //console.log(data.toString());
    });
    ffmpeg.on("exit", () => {
        console.log("Loaded frame from " + file.filename);
        res.writeHead(200, { "Content-Type": "image/jpeg" });
        res.end(buffer.getContents(), "binary");
    });
});

server.listen(8001);
console.log("Listening...");
