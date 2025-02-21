@echo off
setlocal enabledelayedexpansion

:: Set Docker registry URL
set REGISTRY_URL=ghcr.io/lookslikeivelost

:: Define an array of tags and directories
set TAGS[0]=discord-bot
set DIRS[0]=discord-bot

set TAGS[1]=language-model
set DIRS[1]=services/language-model

set TAGS[2]=audio-processor
set DIRS[2]=services/audio-processor

:: Loop through the tags and directories
for /L %%i in (0,1,2) do (
    set TAG=!TAGS[%%i]!
    set DIR=!DIRS[%%i]!
    
    echo Building and pushing !TAG! from !DIR!
    
    :: Build the Docker image
    docker build -t %REGISTRY_URL%/!TAG! !DIR!
    
    :: Push the image to GitHub Container Registry
    docker push %REGISTRY_URL%/!TAG!
    
    echo Finished processing !TAG!
    echo.
)

echo All tags have been built and pushed.