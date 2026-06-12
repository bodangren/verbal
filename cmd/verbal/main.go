package main

import (
	"fmt"
	"os"

	"verbal/internal/app"
)

const smokeCheckArg = "--smoke-check"

func main() {
	dbPath := app.DefaultDBPath()
	ctrl := app.New(dbPath, nil)

	if len(os.Args) > 1 && os.Args[1] == smokeCheckArg {
		if err := ctrl.RunSmokeCheck(); err != nil {
			fmt.Fprintf(os.Stderr, "startup smoke check failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("smoke-check:ok")
		return
	}

	if err := ctrl.Activate(); err != nil {
		fmt.Fprintf(os.Stderr, "failed to activate application: %v\n", err)
		os.Exit(1)
	}
}
