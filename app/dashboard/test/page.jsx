"use client";

import React, { useState, useEffect, useRef, useContext } from "react";
import { Button } from "@/components/ui/button";
import Webcam from "react-webcam";
import { toast } from "sonner";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import "@tensorflow/tfjs-backend-webgl";
import { WebCamContext } from "@/app/dashboard/layout";

const RecordAnswerSection = ({
  mockInterviewQuestion,
  activeQuestionIndex,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const { webCamEnabled, setWebCamEnabled } = useContext(WebCamContext);
  const webcamRef = useRef(null);
  const [gazeAlert, setGazeAlert] = useState(false);
  const [unauthorizedObjects, setUnauthorizedObjects] = useState([]);

  useEffect(() => {
    if (webCamEnabled) {
      initializeMonitoring();
    }
  }, [webCamEnabled]);

  const initializeMonitoring = async () => {
    const faceModel = await faceLandmarksDetection.load(
      faceLandmarksDetection.SupportedPackages.mediapipeFacemesh
    );
    const objectModel = await cocoSsd.load();

    const monitorWebcam = async () => {
      const video = webcamRef.current?.video;
      if (!video || video.readyState !== 4) return;

      // Gaze detection
      const facePredictions = await faceModel.estimateFaces({ input: video });
      if (facePredictions.length > 0) {
        const face = facePredictions[0];
        const leftEye = face.annotations.leftEye[0];
        const rightEye = face.annotations.rightEye[0];
        const isLookingAway = detectGazeDirection(leftEye, rightEye);
        setGazeAlert(isLookingAway);
      }

      // Object detection
      const objectPredictions = await objectModel.detect(video);
      const unauthorized = objectPredictions.filter((obj) =>
        ["cell phone", "book"].includes(obj.class)
      );
      setUnauthorizedObjects(unauthorized);
    };

    const interval = setInterval(monitorWebcam, 500); // Check every 500ms
    return () => clearInterval(interval);
  };

  const detectGazeDirection = (leftEye, rightEye) => {
    const eyeDistance = Math.abs(leftEye[0] - rightEye[0]);
    return eyeDistance < 20; // Adjust threshold based on testing
  };

  const handleRecording = () => {
    setIsRecording((prev) => !prev);
    if (!isRecording) {
      toast.success("Recording Started");
    } else {
      toast.info("Recording Stopped");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="flex flex-col items-center justify-center rounded-lg p-5 bg-black mt-4 w-[30rem]">
        {webCamEnabled ? (
          <Webcam
            ref={webcamRef}
            mirrored
            style={{ width: "100%", height: 250, zIndex: 10 }}
          />
        ) : (
          <div className="text-white">Webcam Disabled</div>
        )}
      </div>

      <div className="mt-4 flex gap-4">
        <Button onClick={() => setWebCamEnabled((prev) => !prev)}>
          {webCamEnabled ? "Disable Webcam" : "Enable Webcam"}
        </Button>
        <Button onClick={handleRecording}>
          {isRecording ? "Stop Recording" : "Start Recording"}
        </Button>
      </div>

      {gazeAlert && (
        <div className="mt-4 p-2 bg-red-500 text-white rounded-lg">
          Warning: User is looking away from the screen!
        </div>
      )}

      {unauthorizedObjects.length > 0 && (
        <div className="mt-4 p-2 bg-red-500 text-white rounded-lg">
          Unauthorized objects detected:{" "}
          {unauthorizedObjects.map((obj) => obj.class).join(", ")}
        </div>
      )}
    </div>
  );
};

export default RecordAnswerSection;
