const express = require("express");
const { ocrSpace } = require("ocr-space-api-wrapper");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const axios = require("axios");
const app = express();
require("dotenv").config();
app.use(express.json());
app.use(express.static("public"));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads"); // null is for error // './uploads' is the path where the file will be stored
  },
  filename: function (req, file, cb) {
    let ext = file.originalname.substring(
      file.originalname.lastIndexOf("."),
      file.originalname.length
    ); // get the extension of the file // eg: .png, .jpg
    req.body.fileExt = ext;
    let filenameWithoutExt = Date.now();
    req.body.filenameWithoutExt = filenameWithoutExt;
    let filename = filenameWithoutExt + ext;
    cb(null, filename); // null is for error // Date.now() is used to get the current time in milliseconds
  },
});

const upload = multer({ storage: storage });

async function imgUrlToText(url) {
  try {
    // Using the OCR.space default free API key (max 10reqs in 10mins) + remote file
    const res1 = await ocrSpace(url);
    return res1;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function pdfToText(pathToPDF) {
  try {
    // Using your personal API key + local file
    const res2 = await ocrSpace(pathToPDF, {
      apiKey: process.env.API_KEY,
      isCreateSearchablePdf: true,
      isSearchablePdfHideTextLayer: true,
    });
    return res2;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function imgToText(pathToImage, ext) {
  try {
    // Read the image file asynchronously and convert it to base64
    const imageData = await new Promise((resolve, reject) => {
      fs.readFile(pathToImage, { encoding: "base64"}, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    // console.log(imageData);
    // Using your personal API key + base64 image + custom language
    const res3 = await ocrSpace(`data:image/${ext};base64,${imageData}`, {
      apiKey: process.env.API_KEY,
      language: "eng",
      isCreateSearchablePdf: true,
      isSearchablePdfHideTextLayer: true
    });
    return res3;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function pdfToCsv(pathToPDF, outputFileName) {
  return new Promise((resolve, reject) => {
    try {
      const pythonProcess = spawn("python3", [
        "script.py",
        pathToPDF,
        "--output_file",
        outputFileName,
      ]);

      pythonProcess.stderr.on("data", (data) => {
        console.error(data.toString());
      });

      pythonProcess.stdout.on("data", (data) => {
        console.log(data.toString());
      });

      pythonProcess.on("close", (code) => {
        console.log(`child process exited with code ${code}`);
        if (code === 0) {
          resolve(); // Resolve the promise if the process exits successfully
        } else {
          reject(new Error(`child process exited with code ${code}`)); // Reject the promise if there is an error
        }
      });
    } catch (error) {
      console.error(error);
      reject(error);
    }
  });
}

async function downloadPDF(url, outputFileName) {
  try {
    const fileUrl = url;
    const localFilePath = outputFileName;
    const response = await axios({
      method: "get",
      url: fileUrl,
      responseType: "stream",
    });
    const file = fs.createWriteStream(localFilePath);
    response.data.pipe(file);
    return new Promise((resolve, reject) => {
      file.on("finish", () => {
        console.log("File downloaded and saved successfully!");
        resolve();
      });
      file.on("error", (err) => {
        fs.unlink(localFilePath, () => {
          reject(err);
        });
      });
    });
  } catch (error) {
    console.error(`Error while downloading the file: ${error.message}`);
    throw error;
  }
}

app.post("/convert/pdfToText", upload.single("pdf"), (req, res) => {
    // console.log(req.file);
  const pathToPDF = req.file.path;
  // console.log(pathToPDF);
  pdfToText(pathToPDF)
    .then((result) => {
      res.send(result);
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({ error: "Something went wrong" });
    });
});

app.post("/convert/imgUrlToText", (req, res) => {
  const url = req.body.imageURL;
  imgUrlToText(url)
    .then((result) => {
      console.log(result);
      res.send(result);
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({ error: "Something went wrong" });
    });
});

app.post("/convert/imgToText", upload.single("image"), (req, res) => {
  // console.log(req.file);
  const pathToImage = req.file.path;
  const ext = String(req.body.fileExt).replace(".", "");
  // console.log(ext);
  console.log(pathToImage);
  imgToText(pathToImage, ext)
    .then((result) => {
      res.send(result);
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({ error: "Something went wrong" });
    });
});

app.post('/convert/pdfToCsv',upload.single('pdf'),(req,res)=>{
  const isReadable = req.query.ocrEnabled;
  // const isReadable = req.body.readable;
  const pathToPDF = req.file.path;
  const filenameWithoutExt = req.body.filenameWithoutExt;
  const outputFileName = "outputs/" + filenameWithoutExt + ".csv";
  console.log('isReadable is '+isReadable);
  if (isReadable === "true") {
    console.log('pdf is readable');
    pdfToCsv(pathToPDF, outputFileName)
      .then(() => {
        res.json({
          message: "PDF converted to CSV successfully",
          outputFileName: "http://localhost:3000/download/"+filenameWithoutExt + ".csv"
        });
      })
      .catch((error) => {
        // console.error('Error converting PDF to CSV:', error);
        res.status(500).json({ error: "Something went wrong" });
      });
  } else if(isReadable === "false") {
    console.log('pdf is not readable');
    //make pdf readable
    pdfToText(pathToPDF)
      .then((result) => {
        //get searchable pdf url
        //download searchable pdf and convert to csv
        const url = result.SearchablePDFURL;
        // console.log(url);
        downloadPDF(url, pathToPDF).then(() => {
          pdfToCsv(pathToPDF, outputFileName)
            .then(() => {
              res.json({
                message: "PDF converted to CSV successfully",
                outputFileName: "http://localhost:3000/download/"+filenameWithoutExt + ".csv"
              });
            })
            .catch((error) => {
              // console.error('Error converting PDF to CSV:', error);
              res.status(500).json({ error: "Something went wrong" });
            });
        });
      })
      .catch((err) => {
        console.log(err);
        res.status(500).json({ error: "Something went wrong" });
      });
  }
  else {
    res.status(500).json({ error: "send correct request" });
  }
});

app.get("/download/:filename", (req, res) => {
  const filename = req.params.filename;
  const pathToFile = "outputs/" + filename;
  res.download(pathToFile);
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.use((req, res) => {
  res.status(404).send("404 Page Not Found");
});

app.listen(3000, () => {
  console.log("Server started at port 3000");
});


//changes made to new branch

//keep below code commented

