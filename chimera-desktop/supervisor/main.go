package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	ContainerName   = "chimera"
	ImageName       = "chimera:latest"
	ContainerPort   = "3002"
	SupervisorPort  = "0" // dynamic
	HealthEndpoint  = "/api/status"
)

type State struct {
	Running       bool   `json:"running"`
	DockerPresent bool   `json:"docker_present"`
	Logs          string `json:"logs"`
	Error         string `json:"error,omitempty"`
	AppURL        string `json:"app_url,omitempty"`
}

var state = &State{}
var logsBuilder strings.Builder

func writeLog(format string, args ...interface{}) {
	line := fmt.Sprintf(format+"\n", args...)
	logsBuilder.WriteString(line)
	// keep last 500 lines
	lines := strings.Split(logsBuilder.String(), "\n")
	if len(lines) > 500 {
		lines = lines[len(lines)-500:]
		logsBuilder.Reset()
		logsBuilder.WriteString(strings.Join(lines, "\n"))
	}
}

func dockerAvailable() bool {
	cmd := exec.Command("docker", "version")
	cmd.Env = os.Environ()
	if err := cmd.Run(); err != nil {
		return false
	}
	return true
}

func containerRunning() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "docker", "inspect", "-f", "{{.State.Running}}", ContainerName)
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(out)) == "true"
}

func startContainer() error {
	writeLog("Checking Docker availability...")
	if !dockerAvailable() {
		return fmt.Errorf("docker not available; install Docker Desktop or Docker Engine")
	}
	state.DockerPresent = true

	writeLog("Ensuring image exists: %s", ImageName)
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	pull := exec.CommandContext(ctx, "docker", "pull", ImageName)
	pull.Stdout = os.Stdout
	pull.Stderr = os.Stderr
	// Ignore pull error (image may be local)
	_ = pull.Run()

	writeLog("Checking for existing container...")
	if containerRunning() {
		writeLog("Container already running")
		state.Running = true
		return nil
	}

	// Remove old container if exists
	exec.Command("docker", "rm", "-f", ContainerName).Run()

	writeLog("Starting container %s...", ContainerName)
	ctx2, cancel2 := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel2()
	cmd := exec.CommandContext(ctx2, "docker", "run", "-d",
		"--name", ContainerName,
		"-p", ContainerPort+":"+ContainerPort,
		"-v", "chimera-data:/app/llmwiki-data",
		"-e", "NODE_ENV=production",
		"-e", "PORT="+ContainerPort,
		ImageName,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker run failed: %w\n%s", err, string(out))
	}
	writeLog("Container started: %s", strings.TrimSpace(string(out)))

	// Wait for health
	writeLog("Waiting for app to be ready...")
	for i := 0; i < 60; i++ {
		time.Sleep(2 * time.Second)
		resp, err := http.Get("http://localhost:" + ContainerPort + HealthEndpoint)
		if err == nil && resp.StatusCode == 200 {
			resp.Body.Close()
			writeLog("App is ready on http://localhost:%s", ContainerPort)
			state.AppURL = "http://localhost:" + ContainerPort
			state.Running = true
			return nil
		}
		if resp != nil {
			resp.Body.Close()
		}
	}
	return fmt.Errorf("app did not become healthy within 2 minutes")
}

func stopContainer() error {
	writeLog("Stopping container %s...", ContainerName)
	cmd := exec.Command("docker", "stop", "-t", "10", ContainerName)
	out, err := cmd.CombinedOutput()
	if err != nil && !strings.Contains(string(out), "No such container") {
		return fmt.Errorf("docker stop failed: %w\n%s", err, string(out))
	}
	writeLog("Container stopped")
	state.Running = false
	state.AppURL = ""
	return nil
}

func streamLogs() {
	cmd := exec.Command("docker", "logs", "-f", ContainerName)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return
	}
	if err := cmd.Start(); err != nil {
		return
	}
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			writeLog("[container] %s", scanner.Text())
		}
	}()
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			writeLog("[container err] %s", scanner.Text())
		}
	}()
	cmd.Wait()
}

func getAppDataDir() string {
	switch runtime.GOOS {
	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support", "Chimera")
	case "windows":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "AppData", "Local", "Chimera")
	default:
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".local", "share", "chimera")
	}
}

func writePid() {
	dir := getAppDataDir()
	os.MkdirAll(dir, 0755)
	pidFile := filepath.Join(dir, "supervisor.pid")
	os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", os.Getpid())), 0644)
}

func main() {
	writePid()

	port := "9876"
	log.Printf("Supervisor API on port %s", port)

	mux := http.NewServeMux()

	mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		state.Logs = logsBuilder.String()
		json.NewEncoder(w).Encode(state)
	})

	mux.HandleFunc("/start", func(w http.ResponseWriter, r *http.Request) {
		if state.Running {
			json.NewEncoder(w).Encode(map[string]string{"status": "already running"})
			return
		}
		state.Error = ""
		if err := startContainer(); err != nil {
			state.Error = err.Error()
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		go streamLogs()
		json.NewEncoder(w).Encode(map[string]string{"status": "started", "url": state.AppURL})
	})

	mux.HandleFunc("/stop", func(w http.ResponseWriter, r *http.Request) {
		if !state.Running {
			json.NewEncoder(w).Encode(map[string]string{"status": "not running"})
			return
		}
		if err := stopContainer(); err != nil {
			state.Error = err.Error()
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"status": "stopped"})
	})

	mux.HandleFunc("/logs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		io.WriteString(w, logsBuilder.String())
	})

	log.Printf("Supervisor listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
