"use client";

import { db } from "@/utils/db";
import { MockInterview } from "@/utils/schema";
import { eq } from "drizzle-orm";
import { Lightbulb, WebcamIcon, AlertCircle } from "lucide-react";
import React, { useEffect, useState, useRef, useContext } from "react";
import { Button } from "@/components/ui/button";
import Webcam from "react-webcam";
import Link from "next/link";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as posenet from "@tensorflow-models/posenet";
import "@tensorflow/tfjs";
import { WebCamContext } from "../../layout";

const Interview = ({ params }) => {
  const { webCamEnabled, setWebCamEnabled } = useContext(WebCamContext);
  const [interviewData, setInterviewData] = useState();
  const [warning, setWarning] = useState(false);
  const [postureWarning, setPostureWarning] = useState(false);
  const [multiplePersonWarning, setMultiplePersonWarning] = useState(false);
  const [emptyScreenWarning, setEmptyScreenWarning] = useState(false);
  const webcamRef = useRef(null);
  const [cocoModel, setCocoModel] = useState(null);
  const [poseModel, setPoseModel] = useState(null);

  const phoneDetectionBuffer = useRef([]);
  const postureDetectionBuffer = useRef([]);
  const peopleCountBuffer = useRef([]);
  const emptyScreenBuffer = useRef([]);

  const BUFFER_SIZE = 3; // Smaller buffer for faster detection
  const DETECTION_THRESHOLD = 0.7;
  const POSTURE_THRESHOLD = 25;

  useEffect(() => {
    GetInterviewDetails();
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const loadedCocoModel = await cocoSsd.load({ base: "mobilenet_v2" });
      const loadedPoseModel = await posenet.load({
        architecture: "MobileNetV1",
        outputStride: 16,
        inputResolution: { width: 640, height: 480 },
        multiplier: 0.75,
      });

      setCocoModel(loadedCocoModel);
      setPoseModel(loadedPoseModel);
    } catch (error) {
      console.error("Error loading models:", error);
    }
  };

  const GetInterviewDetails = async () => {
    try {
      const result = await db
        .select()
        .from(MockInterview)
        .where(eq(MockInterview.mockId, params.interviewId));

      setInterviewData(result[0]);
    } catch (error) {
      console.error("Error fetching interview details:", error);
    }
  };

  useEffect(() => {
    if (webCamEnabled && cocoModel && poseModel) {
      const detect = async () => {
        await runDetection();
        requestAnimationFrame(detect); // Continuous real-time processing
      };

      detect();
    }
  }, [webCamEnabled, cocoModel, poseModel]);

  const runDetection = async () => {
    if (!webcamRef.current?.video || !cocoModel || !poseModel) return;

    try {
      const predictions = await cocoModel.detect(webcamRef.current.video);
      const pose = await poseModel.estimateSinglePose(webcamRef.current.video, {
        flipHorizontal: true,
      });

      const results = {
        phoneDetected: detectPhone(predictions),
        postureIssue: detectPosture(pose),
        peopleCount: detectPeople(predictions),
        isEmpty: detectEmptyScreen(predictions, pose),
      };

      updateWarnings(results);
    } catch (error) {
      console.error("Detection error:", error);
    }
  };

  const detectPhone = (predictions) => {
    return predictions.some(
      (pred) =>
        (pred.class === "cell phone" || pred.class === "mobile phone") &&
        pred.score > DETECTION_THRESHOLD
    );
  };

  const detectPeople = (predictions) => {
    const people = predictions.filter(
      (pred) => pred.class === "person" && pred.score > DETECTION_THRESHOLD
    );
    return people.length;
  };

  const detectPosture = (pose) => {
    const nose = pose.keypoints.find((point) => point.part === "nose");
    const leftEye = pose.keypoints.find((point) => point.part === "leftEye");
    const rightEye = pose.keypoints.find((point) => point.part === "rightEye");
    const leftShoulder = pose.keypoints.find(
      (point) => point.part === "leftShoulder"
    );
    const rightShoulder = pose.keypoints.find(
      (point) => point.part === "rightShoulder"
    );

    if (
      !nose?.score ||
      !leftEye?.score ||
      !rightEye?.score ||
      !leftShoulder?.score ||
      !rightShoulder?.score
    ) {
      return null;
    }

    const eyeMidpoint = {
      y: (leftEye.position.y + rightEye.position.y) / 2,
      x: (leftEye.position.x + rightEye.position.x) / 2,
    };

    const shoulderMidpoint = {
      y: (leftShoulder.position.y + rightShoulder.position.y) / 2,
      x: (leftShoulder.position.x + rightShoulder.position.x) / 2,
    };

    const verticalDeviation = Math.abs(eyeMidpoint.x - shoulderMidpoint.x);
    const forwardLean = nose.position.y - eyeMidpoint.y;

    return {
      hasIssue:
        verticalDeviation > POSTURE_THRESHOLD ||
        forwardLean > POSTURE_THRESHOLD,
      confidence: Math.min(nose.score, leftEye.score, rightEye.score),
    };
  };

  const detectEmptyScreen = (predictions, pose) => {
    const hasPerson = predictions.some(
      (pred) => pred.class === "person" && pred.score > DETECTION_THRESHOLD
    );
    const hasValidPose = pose.score > 0.3;

    return !hasPerson && !hasValidPose;
  };

  const updateWarnings = (results) => {
    phoneDetectionBuffer.current.push(results.phoneDetected);
    if (phoneDetectionBuffer.current.length > BUFFER_SIZE) {
      phoneDetectionBuffer.current.shift();
    }

    if (results.postureIssue) {
      postureDetectionBuffer.current.push(results.postureIssue.hasIssue);
      if (postureDetectionBuffer.current.length > BUFFER_SIZE) {
        postureDetectionBuffer.current.shift();
      }
    }

    peopleCountBuffer.current.push(results.peopleCount);
    if (peopleCountBuffer.current.length > BUFFER_SIZE) {
      peopleCountBuffer.current.shift();
    }

    emptyScreenBuffer.current.push(results.isEmpty);
    if (emptyScreenBuffer.current.length > BUFFER_SIZE) {
      emptyScreenBuffer.current.shift();
    }

    const phoneWarningActive =
      phoneDetectionBuffer.current.filter(Boolean).length > BUFFER_SIZE * 0.6;
    const postureWarningActive =
      postureDetectionBuffer.current.filter(Boolean).length > BUFFER_SIZE * 0.6;
    const multiplePersonWarningActive = peopleCountBuffer.current.some(
      (count) => count > 1
    );
    const emptyScreenWarningActive =
      emptyScreenBuffer.current.filter(Boolean).length === BUFFER_SIZE;

    setWarning(phoneWarningActive);
    setPostureWarning(postureWarningActive);
    setMultiplePersonWarning(multiplePersonWarningActive);
    setEmptyScreenWarning(emptyScreenWarningActive);
  };

  return (
    <div className="my-10">
      <h2 className="font-bold text-2xl text-center">Let's Get Started</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="flex flex-col my-5 gap-5">
          <div className="flex flex-col p-5 rounded-lg border gap-5">
            <h2 className="text-lg">
              <strong>Job Role/Job Position: </strong>
              {interviewData?.jobPosition}
            </h2>
            <h2 className="text-lg">
              <strong>Job Description/Job Stack: </strong>
              {interviewData?.jobDesc}
            </h2>
            <h2 className="text-lg">
              <strong>Years of Experience: </strong>
              {interviewData?.jobExperience}
            </h2>
          </div>
          <div className="p-5 border rounded-lg border-yellow-300 bg-yellow-100">
            <h2 className="flex gap-2 items-center text-yellow-700 mb-2">
              <Lightbulb />
              <strong>Information</strong>
            </h2>
            <h2 className="mt-3 text-yellow-500">
              {process.env.NEXT_PUBLIC_INFORMATION ||
                "No additional information available."}
            </h2>
          </div>
        </div>

        <div>
          {webCamEnabled ? (
            <div className="flex items-center justify-center p-10 relative">
              <Webcam
                ref={webcamRef}
                onUserMedia={() => setWebCamEnabled(true)}
                onUserMediaError={() => setWebCamEnabled(false)}
                height={300}
                width={300}
                mirrored={true}
              />
              {warning && (
                <div className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center bg-red-500 bg-opacity-75 text-white text-xl font-bold">
                  <AlertCircle className="w-8 h-8 mr-2" />
                  Unauthorized Object Detected!
                </div>
              )}
              {postureWarning && (
                <div className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center bg-yellow-500 bg-opacity-75 text-white text-xl font-bold">
                  <AlertCircle className="w-8 h-8 mr-2" />
                  Please Maintain Proper Posture!
                </div>
              )}
              {multiplePersonWarning && (
                <div className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center bg-red-500 bg-opacity-75 text-white text-xl font-bold">
                  <AlertCircle className="w-8 h-8 mr-2" />
                  Multiple People Detected!
                </div>
              )}
              {emptyScreenWarning && (
                <div className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center bg-red-500 bg-opacity-75 text-white text-xl font-bold">
                  <AlertCircle className="w-8 h-8 mr-2" />
                  Please Return to Camera View!
                </div>
              )}
            </div>
          ) : (
            <div>
              <WebcamIcon className="h-72 w-full my-6 p-20 bg-secondary rounded-lg border" />
            </div>
          )}
          <div>
            <Button
              className="w-full"
              onClick={() => setWebCamEnabled((prev) => !prev)}
            >
              {webCamEnabled ? "Close WebCam" : "Enable WebCam"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-center my-4 md:my-0 md:justify-end md:items-end">
        <Link href={"/dashboard/interview/" + params.interviewId + "/start"}>
          <Button>Start Interview</Button>
        </Link>
      </div>
    </div>
  );
};
export default Interview;
